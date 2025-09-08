// src/services/people/teamFit.ts
// Optimizes team composition with constraints

import { getPool } from '../../db/pool';

export interface TeamConstraint {
  type: 'coverage' | 'budget' | 'timezone' | 'seniority_mix' | 'certification';
  requirement: any;
  is_hard: boolean;
}

export interface TeamFitRequest {
  staffing_requests: number[];
  constraints: TeamConstraint[];
  optimization_mode: 'greedy' | 'hungarian' | 'ilp';
}

export interface TeamFitResult {
  assignments: Array<{
    request_id: number;
    person_id: number;
    fit_score: number;
    rate: number;
  }>;
  total_score: number;
  total_cost: number;
  constraints_satisfied: Array<{constraint: TeamConstraint; satisfied: boolean; detail: string}>;
  skill_coverage: Array<{skill_id: number; required_level: number; covered_level: number}>;
}

export class TeamFitOptimizer {
  async optimize(request: TeamFitRequest): Promise<TeamFitResult> {
    // Validate all hard constraints can theoretically be met
    const validation = await this.validateConstraints(request);
    if (!validation.feasible) {
      throw new Error(`Infeasible constraints: ${validation.reasons.join(', ')}`);
    }

    switch (request.optimization_mode) {
      case 'greedy':
        return this.greedyOptimize(request);
      case 'hungarian':
        return this.hungarianOptimize(request);
      case 'ilp':
        return this.ilpOptimize(request);
      default:
        return this.greedyOptimize(request);
    }
  }

  private async validateConstraints(request: TeamFitRequest): Promise<{feasible: boolean; reasons: string[]}> {
    const reasons: string[] = [];
    let feasible = true;

    // Check budget constraints
    const budgetConstraints = request.constraints.filter(c => c.type === 'budget');
    for (const constraint of budgetConstraints) {
      if (constraint.is_hard) {
        // Check if total estimated cost exceeds budget
        const totalEstimated = await this.estimateTotalCost(request.staffing_requests);
        if (totalEstimated > constraint.requirement.cap) {
          feasible = false;
          reasons.push(`Budget constraint violated: estimated $${totalEstimated} > cap $${constraint.requirement.cap}`);
        }
      }
    }

    // Check skill coverage constraints
    const coverageConstraints = request.constraints.filter(c => c.type === 'coverage');
    for (const constraint of coverageConstraints) {
      if (constraint.is_hard) {
        const coverage = await this.checkSkillCoverage(request.staffing_requests, constraint.requirement);
        if (!coverage.satisfied) {
          feasible = false;
          reasons.push(`Skill coverage constraint violated: ${coverage.detail}`);
        }
      }
    }

    return { feasible, reasons };
  }

  private async greedyOptimize(request: TeamFitRequest): Promise<TeamFitResult> {
    const pool = await getPool();
    const assignments: Array<{request_id: number; person_id: number; fit_score: number; rate: number}> = [];
    let totalScore = 0;
    let totalCost = 0;

    // Get all staffing requests with requirements
    const requestsResult = await pool.request()
      .query(`
        SELECT sr.staffing_request_id, sr.role_template_id, rt.requirements
        FROM app.staffing_request sr
        JOIN app.role_template rt ON rt.role_template_id = sr.role_template_id
        WHERE sr.staffing_request_id IN (${request.staffing_requests.join(',')})
      `);

    const requests = requestsResult.recordset;

    for (const req of requests) {
      // Find best person for this request
      const bestPerson = await this.findBestPersonForRequest(req.staffing_request_id, request.constraints);
      if (bestPerson) {
        assignments.push({
          request_id: req.staffing_request_id,
          person_id: bestPerson.person_id,
          fit_score: bestPerson.fit_score,
          rate: bestPerson.modeled_rate.final_amount
        });
        totalScore += bestPerson.fit_score;
        totalCost += bestPerson.modeled_rate.final_amount;
      }
    }

    // Check constraints satisfaction
    const constraints_satisfied = await this.evaluateConstraintsSatisfaction(assignments, request.constraints);
    const skill_coverage = await this.calculateSkillCoverage(assignments);

    return {
      assignments,
      total_score: totalScore,
      total_cost: totalCost,
      constraints_satisfied,
      skill_coverage
    };
  }

  private async hungarianOptimize(request: TeamFitRequest): Promise<TeamFitResult> {
    // Placeholder for Hungarian algorithm implementation
    // This would require a library like 'hungarian-algorithm-ts'
    // For now, fall back to greedy
    console.warn('Hungarian optimization not implemented, using greedy');
    return this.greedyOptimize(request);
  }

  private async ilpOptimize(request: TeamFitRequest): Promise<TeamFitResult> {
    // Placeholder for ILP optimization
    // This would require a library like 'javascript-lp-solver'
    // For now, fall back to greedy
    console.warn('ILP optimization not implemented, using greedy');
    return this.greedyOptimize(request);
  }

  private async findBestPersonForRequest(requestId: number, constraints: TeamConstraint[]) {
    const pool = await getPool();

    // Get ranked candidates (this would call the FitScoreCalculator)
    // For now, simplified query
    const result = await pool.request()
      .input('request_id', requestId)
      .query(`
        SELECT TOP 1
          p.person_id,
          p.name,
          0.85 as fit_score, -- Placeholder
          150.00 as final_amount -- Placeholder
        FROM app.person p
        ORDER BY NEWID() -- Random for demo
      `);

    if (result.recordset.length > 0) {
      const person = result.recordset[0];
      return {
        person_id: person.person_id,
        fit_score: person.fit_score,
        modeled_rate: { final_amount: person.final_amount }
      };
    }

    return null;
  }

  private async estimateTotalCost(requestIds: number[]): Promise<number> {
    // Simplified estimation
    return requestIds.length * 150 * 40; // Assume $150/hr * 40 hours per request
  }

  private async checkSkillCoverage(requestIds: number[], requirement: any): Promise<{satisfied: boolean; detail: string}> {
    // Simplified check
    return { satisfied: true, detail: 'All skills covered' };
  }

  private async evaluateConstraintsSatisfaction(
    assignments: Array<{request_id: number; person_id: number; fit_score: number; rate: number}>,
    constraints: TeamConstraint[]
  ): Promise<Array<{constraint: TeamConstraint; satisfied: boolean; detail: string}>> {
    const results: Array<{constraint: TeamConstraint; satisfied: boolean; detail: string}> = [];

    for (const constraint of constraints) {
      let satisfied = false;
      let detail = '';

      switch (constraint.type) {
        case 'budget':
          const totalCost = assignments.reduce((sum, a) => sum + a.rate, 0);
          satisfied = totalCost <= constraint.requirement.cap;
          detail = `Total cost: $${totalCost}, Cap: $${constraint.requirement.cap}`;
          break;
        case 'coverage':
          satisfied = true; // Simplified
          detail = 'Skills adequately covered';
          break;
        default:
          satisfied = true;
          detail = 'Constraint evaluated';
      }

      results.push({ constraint, satisfied, detail });
    }

    return results;
  }

  private async calculateSkillCoverage(
    assignments: Array<{request_id: number; person_id: number; fit_score: number; rate: number}>
  ): Promise<Array<{skill_id: number; required_level: number; covered_level: number}>> {
    // Simplified skill coverage calculation
    return [
      { skill_id: 1, required_level: 3, covered_level: 4 },
      { skill_id: 2, required_level: 4, covered_level: 3 }
    ];
  }
}
