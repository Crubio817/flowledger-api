-- Migration: Add Workstream Module tables (v2.1)
-- Date: 2025-09-07
-- Adds org_id to existing tables for multi-tenancy, then creates new tables with DDL essentials.

-- Add org_id to existing core tables (assuming default org_id=1; update as needed)
-- ALTER TABLE app.clients ADD org_id int NOT NULL DEFAULT 1; -- Already exists
-- ALTER TABLE app.audits ADD org_id int NOT NULL DEFAULT 1; -- Already exists
-- ALTER TABLE app.client_contacts ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.client_documents ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.client_industries ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.client_integrations ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.client_locations ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.client_notes ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.contact_social_profiles ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.engagement_tags ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.industries ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.task_packs ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.onboarding_task_pack ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.onboarding_task_pack_task ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.pack_tasks ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.message_drafts ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.interviews ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.interview_responses ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.process_maps ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.findings ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.path_templates ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.path_template_versions ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.path_steps ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.audit_steps ADD org_id int NOT NULL DEFAULT 1;
-- ALTER TABLE app.audit_progress ADD org_id int NOT NULL DEFAULT 1;

-- Create new tables with org_id and indexes

-- SIGNALS
create table app.signal (
  signal_id       bigint identity primary key,
  org_id          int not null,
  source_type     varchar(16) check (source_type in ('email','ad','call','note')),
  source_ref      varchar(256),
  snippet         nvarchar(1000),
  contact_id      int null,
  client_id       int null,
  ts              datetime2 not null default sysdatetime(),
  problem_phrase  nvarchar(300) null,
  solution_hint   nvarchar(300) null,
  urgency_score   decimal(3,2) null,
  dedupe_key      varchar(128) not null,
  cluster_id      bigint null,
  idempotency_key varchar(64) null,
  owner_user_id   int null,
  created_at      datetime2 not null default sysdatetime(),
  updated_at      datetime2 not null default sysdatetime(),
  row_version     rowversion
);
create unique index UX_signal_dedupe on app.signal(org_id, dedupe_key);
create index IX_signal_cluster on app.signal(org_id, cluster_id);
create index IX_signal_ts on app.signal(ts desc);
create index IX_signal_org_ts on app.signal(org_id, ts desc);

-- CLUSTERS
create table app.signal_cluster (
  cluster_id   bigint identity primary key,
  org_id       int not null,
  algo         varchar(32) not null,
  params_json  nvarchar(max) null,
  created_at   datetime2 not null default sysdatetime()
);
create index IX_signal_cluster_org on app.signal_cluster(org_id);

-- CANDIDATES
create table app.candidate (
  candidate_id    bigint identity primary key,
  org_id          int not null,
  client_id       int null,
  contact_id      int null,
  problem_id      int null,
  solution_id     int null,
  title           nvarchar(200) null,
  one_liner_scope nvarchar(280) null,
  confidence      decimal(3,2) null,
  value_band      varchar(8) check (value_band in ('low','med','high')),
  next_step       nvarchar(200) null,
  status          varchar(12) check (status in ('new','triaged','nurture','on_hold','promoted','archived')),
  owner_user_id   int null,
  last_touch_at   datetime2 null,
  created_at      datetime2 not null default sysdatetime(),
  updated_at      datetime2 not null default sysdatetime(),
  row_version     rowversion
);
create index IX_candidate_board on app.candidate(org_id, status, owner_user_id, last_touch_at desc);
create index IX_candidate_org_client on app.candidate(org_id, client_id);
create index IX_candidate_org_status on app.candidate(org_id, status);

-- CANDIDATE_SIGNAL
create table app.candidate_signal (
  candidate_id bigint not null,
  signal_id    bigint not null,
  primary key (candidate_id, signal_id)
);
create index IX_candidate_signal_org on app.candidate_signal(candidate_id); -- Assuming org_id not needed here, but can add if linking

-- PURSUITS
create table app.pursuit (
  pursuit_id        bigint identity primary key,
  org_id            int not null,
  candidate_id      bigint not null,
  due_date          date null,
  capture_lead_id   int null,
  proposal_mgr_id   int null,
  pursuit_stage     varchar(8) check (pursuit_stage in ('qual','pink','red','submit','won','lost')),
  compliance_score  decimal(4,1) null,
  forecast_value_usd decimal(18,2) null,
  cos_hours         decimal(10,2) null,
  cos_amount        decimal(18,2) null,
  created_at        datetime2 not null default sysdatetime(),
  updated_at        datetime2 not null default sysdatetime(),
  row_version       rowversion
);
create index IX_pursuit_board on app.pursuit(org_id, pursuit_stage, due_date asc);
create index IX_pursuit_org_candidate on app.pursuit(org_id, candidate_id);
create index IX_pursuit_org_stage on app.pursuit(org_id, pursuit_stage);

-- PROPOSALS
create table app.proposal (
  proposal_id   bigint identity primary key,
  org_id        int not null,
  pursuit_id    bigint not null,
  version       int not null,
  doc_id        varchar(128) null,
  status        varchar(12) check (status in ('draft','sent','signed','void')),
  sent_at       datetime2 null,
  created_at    datetime2 not null default sysdatetime()
);
create unique index UX_proposal_version on app.proposal(org_id, pursuit_id, version);
create index IX_proposal_org_pursuit on app.proposal(org_id, pursuit_id);

-- COST-OF-SALE DETAIL
create table app.cos_entry (
  cos_id       bigint identity primary key,
  org_id       int not null,
  pursuit_id   bigint not null,
  role         varchar(64) not null,
  hours        decimal(10,2) not null,
  rate         decimal(10,2) null,
  amount       as (case when rate is not null then hours * rate end) persisted,
  source       varchar(24) null,
  created_at   datetime2 not null default sysdatetime()
);
create index IX_cos_org_pursuit on app.cos_entry(org_id, pursuit_id);

-- PERT ESTIMATING BY ROLE
create table app.pursuit_role_estimate (
  estimate_id       bigint identity primary key,
  org_id            int not null,
  pursuit_id        bigint not null,
  role              varchar(64) not null,
  optimistic_hours  decimal(10,2) not null,
  most_likely_hours decimal(10,2) not null,
  pessimistic_hours decimal(10,2) not null,
  confidence        decimal(3,2) null,
  created_at        datetime2 not null default sysdatetime()
);
create index IX_estimate_org_pursuit on app.pursuit_role_estimate(org_id, pursuit_id);

-- LINKS
create table app.work_item_link (
  link_id     bigint identity primary key,
  org_id      int not null,
  item_type   varchar(12) check (item_type in ('signal','candidate','pursuit')),
  item_id     bigint not null,
  link_type   varchar(12) check (link_type in ('thread','doc')),
  target_type varchar(24),
  target_ref  varchar(256),
  created_at  datetime2 not null default sysdatetime()
);
create index IX_link_item on app.work_item_link(org_id, item_type, item_id);

-- EVENTS
create table app.work_event (
  event_id     bigint identity primary key,
  org_id       int not null,
  item_type    varchar(12) not null,
  item_id      bigint not null,
  event_name   varchar(40) not null,
  payload_json nvarchar(max) null,
  happened_at  datetime2 not null default sysdatetime(),
  actor_user_id int null
);
create index IX_event_pull on app.work_event(event_id);
create index IX_event_item on app.work_event(org_id, item_type, item_id, happened_at desc);

-- DRIPS
create table app.drip_schedule (
  drip_id       bigint identity primary key,
  org_id        int not null,
  candidate_id  bigint not null,
  template_id   int not null,
  next_run_at   datetime2 not null,
  cadence_days  int not null,
  status        varchar(12) check (status in ('active','paused','done')),
  last_sent_at  datetime2 null
);
create index IX_drip_org_candidate on app.drip_schedule(org_id, candidate_id);

-- TAXONOMY
create table app.problem_taxonomy (
  problem_id   int identity primary key,
  org_id       int not null,
  name         nvarchar(120) not null,
  definition   nvarchar(400) null,
  active       bit not null default 1
);
create index IX_problem_org on app.problem_taxonomy(org_id);

create table app.solution_catalog (
  solution_id  int identity primary key,
  org_id       int not null,
  name         nvarchar(120) not null,
  playbook_ref nvarchar(256) null,
  active       bit not null default 1
);
create index IX_solution_org on app.solution_catalog(org_id);

-- SLAs
create table app.sla_rule (
  rule_id        int identity primary key,
  org_id         int not null,
  item_type      varchar(12) not null,
  stage          varchar(16) null,
  metric         varchar(24) not null,
  threshold_hrs  int not null,
  active_from    datetime2 not null default sysdatetime(),
  active_to      datetime2 null,
  is_active      bit not null default 1
);
create index IX_sla_org_item on app.sla_rule(org_id, item_type);

create table app.sla_breach (
  breach_id     bigint identity primary key,
  org_id        int not null,
  item_type     varchar(12) not null,
  item_id       bigint not null,
  rule_id       int not null,
  breached_at   datetime2 not null default sysdatetime(),
  reason_code   varchar(32) null,
  resolved_at   datetime2 null
);
create index IX_breach_org_item on app.sla_breach(org_id, item_type, item_id);

-- Additional tables for enrichment (if needed for MCP integration)
-- create table app.enrichment_jobs (
--   job_id      varchar(36) primary key,
--   org_id      int not null,
--   provider    varchar(20) not null, -- 'fullenrich', 'clay'
--   input_json  nvarchar(max) null,
--   result_json nvarchar(max) null,
--   status      varchar(20) not null, -- 'pending', 'complete', 'error'
--   created_at  datetime2 not null default sysdatetime(),
--   updated_at  datetime2 not null default sysdatetime()
-- );
-- create index IX_enrichment_org_status on app.enrichment_jobs(org_id, status);
