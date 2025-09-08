// src/api/people/assignmentHandler.ts
// API handler for creating assignments with immutable snapshots

import { Request, Response } from 'express';
import { getPool, sql } from '../../db/pool';
import { RateResolver } from '../../services/people/rateResolver';

const rateResolver = new RateResolver();

export async function createAssignmentHandler(req: Request, res: Response) {
  const pool = await getPool();
  const transaction = pool.transaction();

  try {
    await transaction.begin();

    const {
      org_id,
      person_id,
      engagement_id,
      role_template_id,
      start_date,
      end_date,
      alloc_pct = 100,
      status = 'tentative'
    } = req.body;

    if (!org_id || !person_id || !engagement_id || !role_template_id || !start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required fields: org_id, person_id, engagement_id, role_template_id, start_date, end_date'
      });
    }

    // Resolve and snapshot the rate
    const rateResult = await rateResolver.resolve({
      org_id,
      person_id,
      engagement_id,
      as_of_date: new Date()
    });

    // Create assignment with immutable snapshots
    const assignmentResult = await transaction.request()
      .input('org_id', org_id)
      .input('person_id', person_id)
      .input('engagement_id', engagement_id)
      .input('role_template_id', role_template_id)
      .input('start_date', start_date)
      .input('end_date', end_date)
      .input('alloc_pct', alloc_pct)
      .input('status', status)
      .input('bill_rate_snapshot', rateResult.final_amount)
      .input('cost_rate_snapshot', 100) // Placeholder - would come from person.cost_rate
      .input('currency', rateResult.final_currency)
      .query(`
        INSERT INTO app.assignment (
          org_id, person_id, engagement_id, role_template_id,
          start_date, end_date, alloc_pct, status,
          bill_rate_snapshot, cost_rate_snapshot, currency
        )
        OUTPUT inserted.assignment_id, inserted.created_at
        VALUES (
          @org_id, @person_id, @engagement_id, @role_template_id,
          @start_date, @end_date, @alloc_pct, @status,
          @bill_rate_snapshot, @cost_rate_snapshot, @currency
        )
      `);

    const assignment = assignmentResult.recordset[0];

    // Log the audit event
    await transaction.request()
      .input('org_id', org_id)
      .input('table_name', 'assignment')
      .input('record_id', assignment.assignment_id)
      .input('action', 'INSERT')
      .input('new_values', JSON.stringify({
        person_id,
        engagement_id,
        bill_rate_snapshot: rateResult.final_amount,
        cost_rate_snapshot: 100,
        rate_breakdown: rateResult.breakdown
      }))
      .query(`
        INSERT INTO app.audit_log (org_id, table_name, record_id, action, new_values)
        VALUES (@org_id, @table_name, @record_id, @action, @new_values)
      `);

    await transaction.commit();

    res.status(201).json({
      data: {
        assignment_id: assignment.assignment_id,
        person_id,
        engagement_id,
        bill_rate_snapshot: rateResult.final_amount,
        cost_rate_snapshot: 100,
        currency: rateResult.final_currency,
        rate_breakdown: rateResult.breakdown,
        created_at: assignment.created_at
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error in createAssignmentHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function updateAssignmentHandler(req: Request, res: Response) {
  try {
    const { assignment_id } = req.params;
    const updates = req.body;

    // Prevent updates to snapshot fields
    if (updates.bill_rate_snapshot !== undefined || updates.cost_rate_snapshot !== undefined) {
      return res.status(400).json({
        error: 'Cannot update snapshot fields'
      });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('assignment_id', assignment_id)
      .input('status', updates.status)
      .input('alloc_pct', updates.alloc_pct)
      .query(`
        UPDATE app.assignment
        SET status = @status, alloc_pct = @alloc_pct, updated_at = GETUTCDATE()
        WHERE assignment_id = @assignment_id
        SELECT assignment_id, status, alloc_pct, updated_at
        FROM app.assignment WHERE assignment_id = @assignment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ data: result.recordset[0] });

  } catch (error) {
    console.error('Error in updateAssignmentHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
