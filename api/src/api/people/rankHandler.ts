// src/api/people/rankHandler.ts
// API handler for ranking people for staffing requests

import { Request, Response } from 'express';
import { FitScoreCalculator } from '../../services/people/fitScore';
import { RateResolver } from '../../services/people/rateResolver';

const fitScoreCalculator = new FitScoreCalculator();
const rateResolver = new RateResolver();

export async function rankPeopleHandler(req: Request, res: Response) {
  try {
    const { org_id, staffing_request_id, limit = 20, include_rate_preview = true } = req.query;

    if (!org_id || !staffing_request_id) {
      return res.status(400).json({
        error: 'Missing required parameters: org_id, staffing_request_id'
      });
    }

    // Calculate fit scores
    const fits = await fitScoreCalculator.calculateForRequest({
      org_id: parseInt(org_id as string),
      staffing_request_id: parseInt(staffing_request_id as string),
      limit: parseInt(limit as string)
    });

    // Add rate previews if requested
    if (include_rate_preview === 'true') {
      for (const fit of fits) {
        try {
          // Get person's skills and other details for rate calculation
          const rateParams = {
            org_id: parseInt(org_id as string),
            person_id: fit.person_id,
            // Add engagement_id from request if available
            as_of_date: new Date()
          };

          const rateResult = await rateResolver.resolve(rateParams);
          fit.modeled_rate = {
            currency: rateResult.final_currency,
            base: rateResult.base_amount,
            abs_premiums: rateResult.premiums.absolute,
            pct_premiums: rateResult.premiums.percentage,
            scarcity: rateResult.scarcity_multiplier,
            total: rateResult.final_amount,
            override_source: rateResult.precedence_applied
          };
        } catch (rateError) {
          console.warn(`Failed to calculate rate for person ${fit.person_id}:`, rateError);
          fit.modeled_rate = null;
        }
      }
    }

    res.json({
      data: fits,
      meta: {
        total: fits.length,
        limit: parseInt(limit as string),
        staffing_request_id: parseInt(staffing_request_id as string)
      }
    });

  } catch (error) {
    console.error('Error in rankPeopleHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
