// src/services/people/fitScore.ts
// Calculates FitScore with explainable reasons

import { getPool, sql } from '../../db/pool';

export interface PersonFit {
  person_id: number;
  fit_score: number;
  reasons: Array<{
    code: string;
    detail: string;
    contribution: number;
    evidence?: any;
  }>;
  modeled_rate?: any;
}

export interface FitScoreParams {
  org_id: number;
  staffing_request_id: number;
  person_ids?: number[];
  limit?: number;
}

interface PersonSkill {
  skill_id: number;
  level: number;
  last_used_at?: string;
  name: string;
  type: string;
}

interface Requirement {
  skill_id: number;
  min_level: number;
  weight?: number;
}

interface SoftTarget {
  skill_id: number;
  weight?: number;
}

export class FitScoreCalculator {
  async calculateForRequest(params: FitScoreParams): Promise<PersonFit[]> {
    const pool = await getPool();

    // Get request details
    const requestResult = await pool.request()
      .input('request_id', params.staffing_request_id)
      .query(`
        SELECT sr.*, rt.requirements, rt.soft_targets
        FROM app.staffing_request sr
        JOIN app.role_template rt ON rt.role_template_id = sr.role_template_id
        WHERE sr.staffing_request_id = @request_id
      `);

    if (requestResult.recordset.length === 0) {
      throw new Error('Staffing request not found');
    }

    const request = requestResult.recordset[0];
    const requirements: Requirement[] = JSON.parse(request.requirements || '[]');
    const softTargets: SoftTarget[] = JSON.parse(request.soft_targets || '[]');
    const mustHaveSkills: number[] = JSON.parse(request.must_have_skills || '[]');

    // Get candidate people
    let peopleQuery = `
      SELECT p.person_id, p.name, p.level, p.timezone, p.reliability_score,
             p.client_history, p.industry_history
      FROM app.person p
      WHERE p.org_id = ${params.org_id}
    `;

    if (params.person_ids?.length) {
      peopleQuery += ` AND p.person_id IN (${params.person_ids.join(',')})`;
    }

    peopleQuery += ` ORDER BY p.person_id`;

    if (params.limit) {
      peopleQuery += ` OFFSET 0 ROWS FETCH NEXT ${params.limit} ROWS ONLY`;
    }

    const peopleResult = await pool.request().query(peopleQuery);
    const people = peopleResult.recordset;

    const fits: PersonFit[] = [];

    for (const person of people) {
      const fit = await this.calculatePersonFit(person, request, requirements, softTargets, mustHaveSkills);
      fits.push(fit);
    }

    // Sort by fit score descending
    return fits.sort((a, b) => b.fit_score - a.fit_score);
  }

  private async calculatePersonFit(
    person: any,
    request: any,
    requirements: Requirement[],
    softTargets: SoftTarget[],
    mustHaveSkills: number[]
  ): Promise<PersonFit> {
    const reasons: Array<{code: string; detail: string; contribution: number; evidence?: any}> = [];

    let totalScore = 0;
    const weights = { hard: 0.35, soft: 0.15, availability: 0.15, tz: 0.10, domain: 0.10, reliability: 0.10, continuity: 0.05 };

    // Hard skills fit
    const hardScore = await this.calculateHardSkillsFit(person.person_id, requirements, mustHaveSkills);
    totalScore += hardScore.score * weights.hard;
    reasons.push(...hardScore.reasons);

    // Soft skills fit
    const softScore = await this.calculateSoftSkillsFit(person.person_id, softTargets);
    totalScore += softScore.score * weights.soft;
    reasons.push(...softScore.reasons);

    // Availability fit
    const availScore = await this.calculateAvailabilityFit(person.person_id, request.start_date, request.end_date);
    totalScore += availScore.score * weights.availability;
    reasons.push(...availScore.reasons);

    // Timezone fit
    const tzScore = this.calculateTimezoneFit(person.timezone, request.timezone_window);
    totalScore += tzScore.score * weights.tz;
    reasons.push(tzScore.reason);

    // Domain fit
    const domainScore = this.calculateDomainFit(person.client_history, person.industry_history, request.parent_type, request.parent_id);
    totalScore += domainScore.score * weights.domain;
    reasons.push(domainScore.reason);

    // Reliability fit
    const reliabilityScore = person.reliability_score || 0.8;
    totalScore += reliabilityScore * weights.reliability;
    reasons.push({
      code: 'RELIABILITY',
      detail: `Reliability score: ${(reliabilityScore * 100).toFixed(0)}%`,
      contribution: reliabilityScore * weights.reliability
    });

    // Continuity fit
    const continuityScore = await this.calculateContinuityFit(person.person_id, request.parent_type, request.parent_id);
    totalScore += continuityScore.score * weights.continuity;
    reasons.push(continuityScore.reason);

    return {
      person_id: person.person_id,
      fit_score: Math.round(totalScore * 100) / 100, // Round to 2 decimals
      reasons
    };
  }

  private async calculateHardSkillsFit(personId: number, requirements: Requirement[], mustHaveSkills: number[]) {
    const pool = await getPool();
    const result = await pool.request()
      .input('person_id', personId)
      .query(`
        SELECT ps.skill_id, ps.level, ps.last_used_at, s.name, s.type
        FROM app.person_skill ps
        JOIN app.skill s ON s.skill_id = ps.skill_id
        WHERE ps.person_id = @person_id
      `);

    const personSkills: PersonSkill[] = result.recordset;
    const skillMap = new Map(personSkills.map((s: PersonSkill) => [s.skill_id, s]));

    let totalWeightedScore = 0;
    let totalWeight = 0;
    const reasons: Array<{code: string; detail: string; contribution: number; evidence?: any}> = [];

    for (const req of requirements) {
      const personSkill = skillMap.get(req.skill_id);
      const weight = req.weight || 1;
      totalWeight += weight;

      if (personSkill) {
        // Calculate level match
        const levelRatio = Math.min(personSkill.level / req.min_level, 1);
        let score = levelRatio * weight;

        // Recency boost: 0.8 + 0.2 * exp(-days/365)
        if (personSkill.last_used_at) {
          const daysSince = (Date.now() - new Date(personSkill.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
          const recencyBoost = 0.8 + 0.2 * Math.exp(-daysSince / 365);
          score *= recencyBoost;
        }

        totalWeightedScore += score;

        const isMustHave = mustHaveSkills.includes(req.skill_id);
        reasons.push({
          code: isMustHave ? 'HARD_SKILL_MATCH' : 'HARD_SKILL_PARTIAL',
          detail: `${personSkill.name} L${personSkill.level} vs L${req.min_level} req${personSkill.last_used_at ? ` (last used ${Math.round((Date.now() - new Date(personSkill.last_used_at).getTime()) / (1000 * 60 * 60 * 24))} days ago)` : ''}`,
          contribution: score,
          evidence: { last_used_at: personSkill.last_used_at }
        });
      } else {
        reasons.push({
          code: 'HARD_SKILL_GAP',
          detail: `Missing required skill: ${req.skill_id}`,
          contribution: 0
        });
      }
    }

    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    return { score: finalScore, reasons };
  }

  private async calculateSoftSkillsFit(personId: number, softTargets: SoftTarget[]) {
    if (!softTargets.length) return { score: 0.5, reasons: [] };

    const pool = await getPool();
    const result = await pool.request()
      .input('person_id', personId)
      .query(`
        SELECT ps.skill_id, ps.level, s.name
        FROM app.person_skill ps
        JOIN app.skill s ON s.skill_id = ps.skill_id
        WHERE ps.person_id = @person_id AND s.type = 'soft'
      `);

    const personSoftSkills: PersonSkill[] = result.recordset;
    const personSoftMap = new Map(personSoftSkills.map((s: PersonSkill) => [s.skill_id, s.level]));

    // Cosine similarity between target vector and person vector
    let dotProduct = 0;
    let personNorm = 0;
    let targetNorm = 0;

    for (const target of softTargets) {
      const personLevel = personSoftMap.get(target.skill_id) || 0;
      const targetWeight = target.weight || 1;

      dotProduct += (personLevel as number) * targetWeight;
      personNorm += (personLevel as number) * (personLevel as number);
      targetNorm += targetWeight * targetWeight;
    }

    const similarity = targetNorm > 0 && personNorm > 0 ?
      dotProduct / (Math.sqrt(personNorm) * Math.sqrt(targetNorm)) : 0;

    const reasons = softTargets.map(target => {
      const personLevel = personSoftMap.get(target.skill_id) || 0;
      return {
        code: (personLevel as number) > 0 ? 'SOFT_SKILL_MATCH' : 'SOFT_SKILL_GAP',
        detail: `${target.skill_id}: ${(personLevel as number)}/5`,
        contribution: ((personLevel as number) / 5) * (target.weight || 1) * 0.1 // Scaled contribution
      };
    });

    return { score: similarity, reasons };
  }

  private async calculateAvailabilityFit(personId: number, startDate: string, endDate: string) {
    const pool = await getPool();
    const result = await pool.request()
      .input('person_id', personId)
      .input('start_date', startDate)
      .input('end_date', endDate)
      .query(`
        SELECT AVG(hours_available) as avg_available,
               AVG(CASE WHEN is_overallocated = 1 THEN 1 ELSE 0 END) as overload_pct
        FROM app.v_person_availability
        WHERE person_id = @person_id
          AND calendar_date BETWEEN @start_date AND @end_date
      `);

    const avail = result.recordset[0];
    const avgAvailable = avail?.avg_available || 8;
    const overloadPct = avail?.overload_pct || 0;

    // Score: 1.0 for fully available, decreasing with overload
    const score = Math.max(0, 1 - overloadPct - (8 - avgAvailable) / 8);

    return {
      score,
      reasons: [{
        code: 'AVAILABILITY',
        detail: `Avg ${avgAvailable.toFixed(1)}h available, ${(overloadPct * 100).toFixed(0)}% overloaded`,
        contribution: score * 0.15
      }]
    };
  }

  private calculateTimezoneFit(personTz: string, requestWindow: string) {
    if (!requestWindow) return { score: 0.5, reason: { code: 'TZ_OVERLAP', detail: 'No timezone window specified', contribution: 0.05 } };

    // Simplified: assume overlap if same timezone or adjacent
    const overlap = personTz === requestWindow ? 1 : 0.7;
    return {
      score: overlap,
      reason: {
        code: 'TZ_OVERLAP',
        detail: `Timezone overlap: ${overlap === 1 ? 'Perfect' : 'Partial'}`,
        contribution: overlap * 0.1
      }
    };
  }

  private calculateDomainFit(clientHistory: string, industryHistory: string, parentType: string, parentId: number) {
    // Simplified: check if client/industry matches
    const history = JSON.parse(clientHistory || '[]').concat(JSON.parse(industryHistory || '[]'));
    const hasMatch = history.some((h: any) => h.id === parentId || h.type === parentType);

    const score = hasMatch ? 0.8 : 0.2;
    return {
      score,
      reason: {
        code: 'DOMAIN',
        detail: hasMatch ? 'Relevant client/industry experience' : 'Limited domain experience',
        contribution: score * 0.1
      }
    };
  }

  private async calculateContinuityFit(personId: number, parentType: string, parentId: number) {
    const pool = await getPool();
    const result = await pool.request()
      .input('person_id', personId)
      .input('parent_id', parentId)
      .query(`
        SELECT COUNT(*) as continuity_count
        FROM app.assignment a
        WHERE a.person_id = @person_id
          AND a.engagement_id = @parent_id
          AND a.status = 'firm'
      `);

    const continuity = result.recordset[0]?.continuity_count > 0;
    const score = continuity ? 0.8 : 0.2;

    return {
      score,
      reason: {
        code: 'CONTINUITY',
        detail: continuity ? 'Already on this engagement' : 'New to engagement',
        contribution: score * 0.05
      }
    };
  }
}
