// src/services/people/rateResolver.ts
// Handles deterministic rate resolution with precedence and currency

import { getPool, sql } from '../../db/pool';

export interface RateResolutionParams {
  org_id: number;
  role_template_id?: number;
  level?: string;
  skills?: number[];
  engagement_id?: number;
  client_id?: number;
  person_id?: number;
  target_currency?: string;
  as_of_date?: Date;
}

export interface RateResolutionResult {
  base_currency: string;
  base_amount: number;
  premiums: {
    absolute: Array<{source: string; amount: number; currency: string}>;
    percentage: Array<{source: string; percentage: number}>;
  };
  scarcity_multiplier: number;
  fx_rate?: number;
  fx_date?: string;
  tax_rate?: number;
  tax_jurisdiction?: string;
  final_amount: number;
  final_currency: string;
  breakdown: string; // JSON audit trail
  precedence_applied: string;
}

export class RateResolver {
  async resolve(params: RateResolutionParams): Promise<RateResolutionResult> {
    // 1. Find base rate by precedence: engagement > client > person > role > org
    const baseRate = await this.findBaseRate(params);

    // 2. Apply absolute premiums
    const absPremiums = await this.getAbsolutePremiums(params);

    // 3. Apply percentage premiums
    const pctPremiums = await this.getPercentagePremiums(params);

    // 4. Apply scarcity multiplier
    const scarcity = await this.getScarcityMultiplier(params);

    // 5. Convert currency if needed
    const fxRate = params.target_currency && params.target_currency !== baseRate.currency ?
      await this.getFxRate(baseRate.currency, params.target_currency, params.as_of_date) : 1;

    // 6. Calculate final amount
    let amount = baseRate.amount;
    absPremiums.forEach((p: any) => amount += p.amount);
    pctPremiums.forEach((p: any) => amount *= (1 + p.percentage / 100));
    amount *= scarcity;
    amount *= fxRate;

    const breakdown = JSON.stringify({
      baseRate,
      absPremiums,
      pctPremiums,
      scarcity,
      fxRate,
      calculated_at: new Date().toISOString()
    });

    return {
      base_currency: baseRate.currency,
      base_amount: baseRate.amount,
      premiums: { absolute: absPremiums, percentage: pctPremiums },
      scarcity_multiplier: scarcity,
      fx_rate: fxRate !== 1 ? fxRate : undefined,
      final_amount: Math.round(amount * 100) / 100, // Round to 2 decimals
      final_currency: params.target_currency || baseRate.currency,
      breakdown,
      precedence_applied: baseRate.precedence
    };
  }

  private async findBaseRate(params: RateResolutionParams) {
    const pool = await getPool();

    // Precedence order queries
    const queries = [
      { scope: 'engagement', id: params.engagement_id, precedence: 'engagement' },
      { scope: 'client', id: params.client_id, precedence: 'client' },
      { scope: 'person', id: params.person_id, precedence: 'person' },
      { scope: 'role', id: params.role_template_id, precedence: 'role' },
      { scope: 'org', id: params.org_id, precedence: 'org' }
    ];

    for (const q of queries) {
      if (q.id) {
        const result = await pool.request()
          .input('org_id', params.org_id)
          .input('scope_id', q.id)
          .input('role_template_id', params.role_template_id || null)
          .input('level', params.level || null)
          .input('as_of', params.as_of_date || new Date())
          .query(`
            SELECT TOP 1 base_rate, currency, '${q.precedence}' as precedence
            FROM app.rate_card
            WHERE org_id = @org_id
              AND scope = '${q.scope}'
              AND scope_id = @scope_id
              AND (role_template_id = @role_template_id OR role_template_id IS NULL)
              AND (level = @level OR level IS NULL)
              AND effective_from <= @as_of
              AND (effective_to IS NULL OR effective_to >= @as_of)
            ORDER BY effective_from DESC
          `);

        if (result.recordset.length > 0) {
          return result.recordset[0];
        }
      }
    }

    throw new Error('No applicable rate found');
  }

  private async getAbsolutePremiums(params: RateResolutionParams) {
    if (!params.skills?.length) return [];

    const pool = await getPool();
    const result = await pool.request()
      .input('org_id', params.org_id)
      .input('skills', params.skills.join(','))
      .input('engagement_id', params.engagement_id || null)
      .input('person_id', params.person_id || null)
      .input('as_of', params.as_of_date || new Date())
      .query(`
        SELECT rp.amount_abs as amount, s.name as skill_name, rp.applies_to
        FROM app.rate_premium rp
        JOIN app.skill s ON s.skill_id = rp.skill_id
        WHERE rp.org_id = @org_id
          AND rp.skill_id IN (SELECT value FROM STRING_SPLIT(@skills, ','))
          AND rp.amount_abs IS NOT NULL
          AND rp.effective_from <= @as_of
          AND (rp.effective_to IS NULL OR rp.effective_to >= @as_of)
          AND (
            (rp.applies_to = 'engagement' AND rp.applies_to_id = @engagement_id) OR
            (rp.applies_to = 'person' AND rp.applies_to_id = @person_id) OR
            rp.applies_to = 'role'
          )
      `);

    return result.recordset.map((r: any) => ({
      source: `${r.skill_name} (${r.applies_to})`,
      amount: r.amount,
      currency: 'USD' // Assume USD for now
    }));
  }

  private async getPercentagePremiums(params: RateResolutionParams) {
    if (!params.skills?.length) return [];

    const pool = await getPool();
    const result = await pool.request()
      .input('org_id', params.org_id)
      .input('skills', params.skills.join(','))
      .input('engagement_id', params.engagement_id || null)
      .input('person_id', params.person_id || null)
      .input('as_of', params.as_of_date || new Date())
      .query(`
        SELECT rp.amount_pct as percentage, s.name as skill_name, rp.applies_to
        FROM app.rate_premium rp
        JOIN app.skill s ON s.skill_id = rp.skill_id
        WHERE rp.org_id = @org_id
          AND rp.skill_id IN (SELECT value FROM STRING_SPLIT(@skills, ','))
          AND rp.amount_pct IS NOT NULL
          AND rp.effective_from <= @as_of
          AND (rp.effective_to IS NULL OR rp.effective_to >= @as_of)
          AND (
            (rp.applies_to = 'engagement' AND rp.applies_to_id = @engagement_id) OR
            (rp.applies_to = 'person' AND rp.applies_to_id = @person_id) OR
            rp.applies_to = 'role'
          )
      `);

    return result.recordset.map((r: any) => ({
      source: `${r.skill_name} (${r.applies_to})`,
      percentage: r.percentage
    }));
  }

  private async getScarcityMultiplier(params: RateResolutionParams): Promise<number> {
    // Start with 1.0, will be updated by background job
    // For now, simple calculation based on open requests
    const pool = await getPool();
    const result = await pool.request()
      .input('org_id', params.org_id)
      .input('role_template_id', params.role_template_id || null)
      .query(`
        SELECT COUNT(*) as open_requests
        FROM app.staffing_request
        WHERE org_id = @org_id
          AND status = 'open'
          AND (role_template_id = @role_template_id OR @role_template_id IS NULL)
      `);

    const openRequests = result.recordset[0]?.open_requests || 0;
    // Simple scarcity: 1.0 base, +0.1 for every 5 open requests, capped at 1.3
    return Math.min(1.0 + (openRequests / 5) * 0.1, 1.3);
  }

  private async getFxRate(fromCurrency: string, toCurrency: string, date?: Date): Promise<number> {
    // Stub: In production, integrate with FX API
    // For now, assume 1:1 for same currency, or hardcoded rates
    if (fromCurrency === toCurrency) return 1;
    if (fromCurrency === 'USD' && toCurrency === 'EUR') return 0.85;
    if (fromCurrency === 'EUR' && toCurrency === 'USD') return 1.18;
    return 1; // Default
  }
}
