import { z } from 'zod';

export const PathTemplateSchema = z.object({
  path_id: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(400).nullable().optional(),
  version: z.string().max(20).optional(),
  active: z.boolean().optional(),
  created_utc: z.string().nullable().optional()
});
export const PathTemplateCreate = PathTemplateSchema.pick({ name: true, description: true, version: true, active: true });
export const PathTemplateUpdate = PathTemplateCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const PathStepSchema = z.object({
  step_id: z.number().int().nonnegative().optional(),
  path_id: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  title: z.string().min(1).max(150),
  state_gate: z.string().max(40),
  required: z.boolean().optional(),
  agent_key: z.string().max(80).nullable().optional(),
  input_contract: z.string().nullable().optional(),
  output_contract: z.string().nullable().optional(),
  created_utc: z.string().nullable().optional()
});
export const PathStepCreate = PathStepSchema.pick({ path_id: true, seq: true, title: true, state_gate: true, required: true, agent_key: true, input_contract: true, output_contract: true });
export const PathStepUpdate = PathStepCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const AuditStepProgressSchema = z.object({
  progress_id: z.number().int().nonnegative().optional(),
  audit_id: z.number().int().nonnegative(),
  step_id: z.number().int().nonnegative(),
  status: z.string().max(30).optional(),
  started_utc: z.coerce.date().nullable().optional(),
  completed_utc: z.coerce.date().nullable().optional(),
  output_json: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_utc: z.string().nullable().optional(),
  updated_utc: z.string().nullable().optional()
});

export const AuditStepProgressCreate = AuditStepProgressSchema.pick({ audit_id: true, step_id: true, status: true, started_utc: true, completed_utc: true, output_json: true, notes: true });
export const AuditStepProgressUpdate = AuditStepProgressCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export type PathTemplate = z.infer<typeof PathTemplateSchema>;
export type PathStep = z.infer<typeof PathStepSchema>;
export type AuditStepProgress = z.infer<typeof AuditStepProgressSchema>;
