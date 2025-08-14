import { z } from 'zod';

export const ClientSchema = z.object({
  client_id: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional()
});

export const ClientCreateBody = ClientSchema.pick({ client_id: true, name: true, is_active: true });
export const ClientUpdateBody = ClientSchema.pick({ name: true, is_active: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const AuditSchema = z.object({
  audit_id: z.number().int().nonnegative(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  scope: z.string().max(1000).nullable().optional(),
  status: z.string().max(40).nullable().optional()
});
export const AuditCreateBody = AuditSchema.pick({ audit_id: true, client_id: true, title: true, scope: true, status: true });
export const AuditUpdateBody = AuditSchema.pick({ title: true, scope: true, status: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const CreateProcBody = z.object({
  Name: z.string().min(1).max(200),
  IsActive: z.boolean().optional()
});

export const ClientSetupBody = z.object({
  client_name: z.string().min(1).max(200).optional(),
  playbook_code: z.string().max(50),
  owner_user_id: z.number().int().nonnegative()
});

export type Client = z.infer<typeof ClientSchema>;
export type Audit = z.infer<typeof AuditSchema>;
