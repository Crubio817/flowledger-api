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

// Client-related helper schemas
export const ClientEngagementSchema = z.object({
  engagement_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.string().max(40).optional()
});
export const ClientEngagementCreate = ClientEngagementSchema.pick({ client_id: true, title: true, start_date: true, end_date: true, status: true });
export const ClientEngagementUpdate = ClientEngagementCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientIntegrationSchema = z.object({
  integration_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  integration_code: z.string().min(1).max(80),
  status: z.string().max(40).optional(),
  config_json: z.string().nullable().optional()
});
export const ClientIntegrationCreate = ClientIntegrationSchema.pick({ client_id: true, integration_code: true, status: true, config_json: true });
export const ClientIntegrationUpdate = ClientIntegrationCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientLocationSchema = z.object({
  location_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  address: z.string().max(1000).optional(),
  active: z.boolean().optional()
});
export const ClientLocationCreate = ClientLocationSchema.pick({ client_id: true, name: true, address: true, active: true });
export const ClientLocationUpdate = ClientLocationCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientContactSchema = z.object({
  contact_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(60).optional(),
  role: z.string().max(100).optional()
});
export const ClientContactCreate = ClientContactSchema.pick({ client_id: true, name: true, email: true, phone: true, role: true });
export const ClientContactUpdate = ClientContactCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const OnboardingTaskSchema = z.object({
  task_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  status: z.string().max(40).optional(),
  due_date: z.string().nullable().optional()
});
export const OnboardingTaskCreate = OnboardingTaskSchema.pick({ client_id: true, title: true, status: true, due_date: true });
export const OnboardingTaskUpdate = OnboardingTaskCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientDocumentSchema = z.object({
  doc_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  doc_code: z.string().min(1).max(80),
  title: z.string().max(200).optional(),
  status: z.string().max(40).optional()
});
export const ClientDocumentCreate = ClientDocumentSchema.pick({ client_id: true, doc_code: true, title: true, status: true });
export const ClientDocumentUpdate = ClientDocumentCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export type ClientEngagement = z.infer<typeof ClientEngagementSchema>;
export type ClientIntegration = z.infer<typeof ClientIntegrationSchema>;
export type ClientLocation = z.infer<typeof ClientLocationSchema>;
export type ClientContact = z.infer<typeof ClientContactSchema>;
export type OnboardingTask = z.infer<typeof OnboardingTaskSchema>;
export type ClientDocument = z.infer<typeof ClientDocumentSchema>;
