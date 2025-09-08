import { z } from 'zod';

export const ClientSchema = z.object({
  client_id: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional(),
  logo_url: z.string().url().nullable().optional()
});

export const ClientCreateBody = ClientSchema.pick({ name: true, is_active: true, logo_url: true }).partial({ is_active: true, logo_url: true });
export const ClientUpdateBody = ClientSchema.pick({ name: true, is_active: true, logo_url: true }).partial().refine(d => Object.keys(d).length>0, 'At least one field required');

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
  OwnerUserId: z.number().int().nullable().optional(),
  LogoUrl: z.string().url().nullable().optional()
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

// Workstream Module Schemas

export const SignalSchema = z.object({
  signal_id: z.number().int().optional(),
  org_id: z.number().int(),
  source_type: z.enum(['email', 'ad', 'call', 'note']),
  source_ref: z.string().max(256).nullable().optional(),
  snippet: z.string().max(1000).nullable().optional(),
  contact_id: z.number().int().nullable().optional(),
  client_id: z.number().int().nullable().optional(),
  ts: z.coerce.date().optional(),
  problem_phrase: z.string().max(300).nullable().optional(),
  solution_hint: z.string().max(300).nullable().optional(),
  urgency_score: z.number().min(0).max(1).nullable().optional(),
  dedupe_key: z.string().max(128),
  cluster_id: z.number().int().nullable().optional(),
  idempotency_key: z.string().max(64).nullable().optional(),
  owner_user_id: z.number().int().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional()
});

export const SignalCreateBody = SignalSchema.pick({
  org_id: true,
  source_type: true,
  source_ref: true,
  snippet: true,
  contact_id: true,
  client_id: true,
  problem_phrase: true,
  solution_hint: true,
  urgency_score: true,
  dedupe_key: true,
  cluster_id: true,
  idempotency_key: true,
  owner_user_id: true
}).partial({
  source_ref: true,
  snippet: true,
  contact_id: true,
  client_id: true,
  problem_phrase: true,
  solution_hint: true,
  urgency_score: true,
  cluster_id: true,
  idempotency_key: true,
  owner_user_id: true
});

export const SignalUpdateBody = SignalSchema.pick({
  source_type: true,
  source_ref: true,
  snippet: true,
  contact_id: true,
  client_id: true,
  problem_phrase: true,
  solution_hint: true,
  urgency_score: true,
  cluster_id: true,
  owner_user_id: true
}).partial().refine(d => Object.keys(d).length > 0, 'At least one field required');

export const CandidateSchema = z.object({
  candidate_id: z.number().int().optional(),
  org_id: z.number().int(),
  client_id: z.number().int().nullable().optional(),
  contact_id: z.number().int().nullable().optional(),
  problem_id: z.number().int().nullable().optional(),
  solution_id: z.number().int().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  one_liner_scope: z.string().max(280).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  value_band: z.enum(['low', 'med', 'high']).nullable().optional(),
  next_step: z.string().max(200).nullable().optional(),
  status: z.enum(['new', 'triaged', 'nurture', 'on_hold', 'promoted', 'archived']),
  owner_user_id: z.number().int().nullable().optional(),
  last_touch_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional()
});

export const CandidateCreateBody = CandidateSchema.pick({
  org_id: true,
  client_id: true,
  contact_id: true,
  problem_id: true,
  solution_id: true,
  title: true,
  one_liner_scope: true,
  confidence: true,
  value_band: true,
  next_step: true,
  status: true,
  owner_user_id: true
}).partial({
  client_id: true,
  contact_id: true,
  problem_id: true,
  solution_id: true,
  title: true,
  one_liner_scope: true,
  confidence: true,
  value_band: true,
  next_step: true,
  owner_user_id: true
});

export const CandidateUpdateBody = CandidateSchema.pick({
  client_id: true,
  contact_id: true,
  problem_id: true,
  solution_id: true,
  title: true,
  one_liner_scope: true,
  confidence: true,
  value_band: true,
  next_step: true,
  status: true,
  owner_user_id: true,
  last_touch_at: true
}).partial().refine(d => Object.keys(d).length > 0, 'At least one field required');

export const PursuitSchema = z.object({
  pursuit_id: z.number().int().optional(),
  org_id: z.number().int(),
  candidate_id: z.number().int(),
  due_date: z.coerce.date().nullable().optional(),
  capture_lead_id: z.number().int().nullable().optional(),
  proposal_mgr_id: z.number().int().nullable().optional(),
  pursuit_stage: z.enum(['qual', 'pink', 'red', 'submit', 'won', 'lost']),
  compliance_score: z.number().min(0).max(100).nullable().optional(),
  forecast_value_usd: z.number().nullable().optional(),
  cos_hours: z.number().nullable().optional(),
  cos_amount: z.number().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional()
});

export const PursuitCreateBody = PursuitSchema.pick({
  org_id: true,
  candidate_id: true,
  due_date: true,
  capture_lead_id: true,
  proposal_mgr_id: true,
  pursuit_stage: true,
  compliance_score: true,
  forecast_value_usd: true,
  cos_hours: true,
  cos_amount: true
}).partial({
  due_date: true,
  capture_lead_id: true,
  proposal_mgr_id: true,
  compliance_score: true,
  forecast_value_usd: true,
  cos_hours: true,
  cos_amount: true
});

export const PursuitUpdateBody = PursuitSchema.pick({
  due_date: true,
  capture_lead_id: true,
  proposal_mgr_id: true,
  pursuit_stage: true,
  compliance_score: true,
  forecast_value_usd: true,
  cos_hours: true,
  cos_amount: true
}).partial().refine(d => Object.keys(d).length > 0, 'At least one field required');

export const ProposalSchema = z.object({
  proposal_id: z.number().int().optional(),
  org_id: z.number().int(),
  pursuit_id: z.number().int(),
  version: z.number().int(),
  doc_id: z.string().max(128).nullable().optional(),
  status: z.enum(['draft', 'sent', 'signed', 'void']),
  sent_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional()
});

export const ProposalCreateBody = ProposalSchema.pick({
  org_id: true,
  pursuit_id: true,
  version: true,
  doc_id: true,
  status: true,
  sent_at: true
}).partial({
  doc_id: true,
  sent_at: true
});

export const WorkEventSchema = z.object({
  event_id: z.number().int().optional(),
  org_id: z.number().int(),
  item_type: z.enum(['signal', 'candidate', 'pursuit']),
  item_id: z.number().int(),
  event_name: z.string().max(40),
  payload_json: z.string().nullable().optional(),
  happened_at: z.coerce.date().optional(),
  actor_user_id: z.number().int().nullable().optional()
});

export const WorkEventCreateBody = WorkEventSchema.pick({
  org_id: true,
  item_type: true,
  item_id: true,
  event_name: true,
  payload_json: true,
  actor_user_id: true
}).partial({
  payload_json: true,
  actor_user_id: true
});

export const DripScheduleSchema = z.object({
  drip_id: z.number().int().optional(),
  org_id: z.number().int(),
  candidate_id: z.number().int(),
  template_id: z.number().int(),
  next_run_at: z.coerce.date(),
  cadence_days: z.number().int(),
  status: z.enum(['active', 'paused', 'done']),
  last_sent_at: z.coerce.date().nullable().optional()
});

export const DripScheduleCreateBody = DripScheduleSchema.pick({
  org_id: true,
  candidate_id: true,
  template_id: true,
  next_run_at: true,
  cadence_days: true,
  status: true,
  last_sent_at: true
}).partial({
  last_sent_at: true
});

export const DripScheduleUpdateBody = DripScheduleSchema.pick({
  next_run_at: true,
  cadence_days: true,
  status: true,
  last_sent_at: true
}).partial().refine(d => Object.keys(d).length > 0, 'At least one field required');

export type Signal = z.infer<typeof SignalSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Pursuit = z.infer<typeof PursuitSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type WorkEvent = z.infer<typeof WorkEventSchema>;
export type DripSchedule = z.infer<typeof DripScheduleSchema>;
