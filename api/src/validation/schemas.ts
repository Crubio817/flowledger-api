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
  IsActive: z.boolean().optional(),
  PrimaryContactId: z.number().int().nullable().optional(),
  PlaybookCode: z.string().max(50).optional(),
  OwnerUserId: z.number().int().nullable().optional()
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
  start_date: z.coerce.date().nullable().optional(),
  end_date: z.coerce.date().nullable().optional(),
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
  first_name: z.string().min(0).max(100).optional(),
  last_name: z.string().min(0).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
  created_utc: z.string().nullable().optional(),
  updated_utc: z.string().nullable().optional()
});
export const ClientContactCreate = ClientContactSchema.pick({ client_id: true, first_name: true, last_name: true, email: true, phone: true, title: true, is_primary: true, is_active: true });
export const ClientContactUpdate = ClientContactCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const OnboardingTaskSchema = z.object({
  task_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  status: z.string().max(40).optional(),
  due_date: z.coerce.date().nullable().optional()
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

export const ClientTagSchema = z.object({
  tag_id: z.number().int().nonnegative().optional(),
  tag_name: z.string().min(1).max(200)
});
export const ClientTagCreate = ClientTagSchema.pick({ tag_name: true });
export const ClientTagUpdate = ClientTagCreate.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientTagMapSchema = z.object({
  client_id: z.number().int().nonnegative(),
  tag_id: z.number().int().nonnegative()
});
export const ClientTagMapCreate = ClientTagMapSchema;
export type ClientTag = z.infer<typeof ClientTagSchema>;
export type ClientTagMap = z.infer<typeof ClientTagMapSchema>;

// Interviews
export const InterviewSchema = z.object({
  interview_id: z.number().int().nonnegative().optional(),
  audit_id: z.number().int().nonnegative(),
  persona: z.string().min(1).max(120),
  mode: z.string().max(40).nullable().optional(),
  scheduled_utc: z.coerce.date().nullable().optional(),
  status: z.string().max(40).optional(),
  notes: z.string().nullable().optional()
});
export const InterviewCreateBody = InterviewSchema.pick({ interview_id: true, audit_id: true, persona: true, mode: true, scheduled_utc: true, status: true, notes: true });
export const InterviewUpdateBody = InterviewSchema.pick({ persona: true, mode: true, scheduled_utc: true, status: true, notes: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

// Interview responses
export const InterviewResponseSchema = z.object({
  response_id: z.number().int().nonnegative().optional(),
  interview_id: z.number().int().nonnegative(),
  question_id: z.string().min(1).max(64),
  answer: z.string().min(1)
});
export const InterviewResponseCreateBody = InterviewResponseSchema.pick({ response_id: true, interview_id: true, question_id: true, answer: true });
export const InterviewResponseUpdateBody = InterviewResponseSchema.pick({ question_id: true, answer: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

// Process maps
export const ProcessMapSchema = z.object({
  process_map_id: z.number().int().nonnegative().optional(),
  audit_id: z.number().int().nonnegative(),
  title: z.string().max(200).nullable().optional(),
  blob_path: z.string().min(1).max(400),
  file_type: z.string().max(40).nullable().optional()
});
export const ProcessMapCreateBody = ProcessMapSchema.pick({ process_map_id: true, audit_id: true, title: true, blob_path: true, file_type: true });
export const ProcessMapUpdateBody = ProcessMapSchema.pick({ title: true, blob_path: true, file_type: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

// Social profiles
export const ContactSocialProfileSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  contact_id: z.number().int().nonnegative(),
  provider: z.string().min(1).max(50),
  profile_url: z.string().url().max(512),
  is_primary: z.boolean().optional(),
  created_utc: z.string().nullable().optional(),
  updated_utc: z.string().nullable().optional()
});
export const ContactSocialProfileCreate = ContactSocialProfileSchema.pick({ contact_id: true, provider: true, profile_url: true, is_primary: true });
export const ContactSocialProfileUpdate = ContactSocialProfileCreate.partial().refine(d=>Object.keys(d).length>0, 'At least one field required');
export type ContactSocialProfile = z.infer<typeof ContactSocialProfileSchema>;
