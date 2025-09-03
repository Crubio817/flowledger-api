import { z } from 'zod';

export const ClientSchema = z.object({
  client_id: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional()
});

export const ClientCreateBody = ClientSchema.pick({ name: true, is_active: true }).partial({ is_active: true });
export const ClientUpdateBody = ClientSchema.pick({ name: true, is_active: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const AuditSchema = z.object({
  audit_id: z.number().int().nonnegative(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  scope: z.string().max(1000).nullable().optional(),
  status: z.string().max(40).nullable().optional(),
  // New/expanded fields added by migrations
  state: z.string().max(30).nullable().optional(),
  domain: z.string().max(50).nullable().optional(),
  audit_type: z.string().max(80).nullable().optional(),
  path_id: z.number().int().nullable().optional(),
  current_step_id: z.number().int().nullable().optional(),
  start_utc: z.coerce.date().nullable().optional(),
  end_utc: z.coerce.date().nullable().optional(),
  owner_contact_id: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional()
});
// AuditCreateBody moved below after optionalNullableDate helper

export const AuditUpdateBody = AuditSchema.pick({
  title: true,
  scope: true,
  status: true,
  state: true,
  domain: true,
  audit_type: true,
  path_id: true,
  current_step_id: true,
  start_utc: true,
  end_utc: true,
  owner_contact_id: true,
  notes: true
}).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const CreateProcBody = z.object({
  Name: z.string().min(1).max(200),
  IsActive: z.boolean().optional(),
  PackCode: z.string().max(64).nullable().optional(),
  PrimaryContactId: z.number().int().nullable().optional(),
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
// Accept empty string, null, date string or Date for start/end dates.
const optionalNullableDate = z.preprocess((val) => {
  // treat empty string and undefined as null
  if (val === '' || val === undefined) return null;
  return val;
}, z.coerce.date().nullable());

export const AuditCreateBody = z.object({
  // creation supports either an engagement_id (preferred) or a client_id for legacy flows
  audit_id: z.number().int().nonnegative().optional(),
  engagement_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(200),
  scope: z.string().max(1000).nullable().optional(),
  status: z.string().max(40).nullable().optional(),
  state: z.string().max(30).nullable().optional(),
  domain: z.string().max(50).nullable().optional(),
  audit_type: z.string().max(80).nullable().optional(),
  path_id: z.number().int().nullable().optional(),
  current_step_id: z.number().int().nullable().optional(),
  start_utc: optionalNullableDate.optional(),
  end_utc: optionalNullableDate.optional(),
  owner_contact_id: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional()
}).refine(d => !!(d.engagement_id || d.client_id), 'engagement_id or client_id required');

// Engagements: support both legacy `title` and current `name`, and both `start_date`/`start_utc` naming.
export const ClientEngagementSchema = z.object({
  engagement_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  // accept either name or title (one required on create)
  name: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  // start/end can be provided as start_date/start_utc and accept empty strings
  start_date: optionalNullableDate.optional(),
  start_utc: optionalNullableDate.optional(),
  end_date: optionalNullableDate.optional(),
  end_utc: optionalNullableDate.optional(),
  status: z.string().max(40).optional(),
  notes: z.string().max(2000).optional()
});

const ClientEngagementCreateBase = z.object({
  client_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  start_date: optionalNullableDate.optional(),
  start_utc: optionalNullableDate.optional(),
  end_date: optionalNullableDate.optional(),
  end_utc: optionalNullableDate.optional(),
  status: z.string().max(40).optional(),
  notes: z.string().max(2000).optional()
});

export const ClientEngagementCreate = ClientEngagementCreateBase.refine(d => !!(d.name || d.title), 'name or title required');

export const ClientEngagementUpdate = ClientEngagementCreateBase.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

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
  label: z.string().min(1).max(200),
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state_province: z.string().max(100).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  is_primary: z.boolean().optional(),
  created_utc: z.string().nullable().optional()
});
export const ClientLocationCreate = ClientLocationSchema.pick({ client_id: true, label: true, line1: true, line2: true, city: true, state_province: true, postal_code: true, country: true, is_primary: true });
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
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  status: z.string().max(40).optional(),
  due_utc: z.coerce.date().nullable().optional()
});
export const OnboardingTaskCreate = OnboardingTaskSchema.pick({ client_id: true, name: true, description: true, status: true, due_utc: true });
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
  engagement_id: z.number().int().nonnegative(),
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

// Task Packs
export const TaskPackSchema = z.object({
  pack_id: z.number().int().nonnegative().optional(),
  pack_code: z.string().min(1).max(50),
  pack_name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  status_scope: z.enum(['active', 'prospect', 'any']).optional(),
  is_active: z.boolean().optional(),
  effective_from_utc: z.coerce.date().nullable().optional(),
  effective_to_utc: z.coerce.date().nullable().optional()
});
export const TaskPackCreateBody = TaskPackSchema.pick({ pack_code: true, pack_name: true, description: true, status_scope: true, is_active: true, effective_from_utc: true, effective_to_utc: true });
export const TaskPackUpdateBody = TaskPackCreateBody.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

// Pack Tasks
export const PackTaskSchema = z.object({
  pack_task_id: z.number().int().nonnegative().optional(),
  pack_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().optional(),
  due_days: z.number().int().optional(),
  status_scope: z.string().max(20).nullable().optional(),
  is_active: z.boolean().optional()
});
export const PackTaskCreateBody = PackTaskSchema.pick({ name: true, sort_order: true, due_days: true, status_scope: true, is_active: true });
export const PackTaskUpdateBody = PackTaskCreateBody.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export type TaskPack = z.infer<typeof TaskPackSchema>;
export type PackTask = z.infer<typeof PackTaskSchema>;

// Industries
export const IndustrySchema = z.object({
  industry_id: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().optional()
});

export const IndustryCreateBody = IndustrySchema.pick({ name: true, description: true, is_active: true });
export const IndustryUpdateBody = IndustryCreateBody.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export const ClientIndustrySchema = z.object({
  client_id: z.number().int().nonnegative(),
  industry_id: z.number().int().nonnegative(),
  is_primary: z.boolean().optional()
});

export const ClientIndustryCreateBody = ClientIndustrySchema.pick({ industry_id: true, is_primary: true });
export const ClientIndustryUpdateBody = ClientIndustryCreateBody.partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export type Industry = z.infer<typeof IndustrySchema>;
export type ClientIndustry = z.infer<typeof ClientIndustrySchema>;

// Client Notes
export const ClientNoteSchema = z.object({
  note_id: z.number().int().nonnegative().optional(),
  client_id: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  content: z.string().max(10000).nullable().optional(),
  note_type: z.string().max(50).nullable().optional(),
  is_important: z.boolean().optional(),
  is_active: z.boolean().optional(),
  created_utc: z.string().nullable().optional(),
  updated_utc: z.string().nullable().optional(),
  created_by: z.string().max(100).nullable().optional(),
  updated_by: z.string().max(100).nullable().optional()
});

export const ClientNoteCreateBody = ClientNoteSchema.pick({
  client_id: true,
  title: true,
  content: true,
  note_type: true,
  is_important: true,
  is_active: true,
  created_by: true
});

export const ClientNoteUpdateBody = ClientNoteSchema.pick({
  title: true,
  content: true,
  note_type: true,
  is_important: true,
  is_active: true,
  updated_by: true
}).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

export type ClientNote = z.infer<typeof ClientNoteSchema>;
