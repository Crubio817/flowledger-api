-- Migration: Add Spotlight System tables
-- Date: 2025-09-09
-- Adds tables for Ideal Customer Profiles (ICPs) in the Workstream Module.

-- SPOTLIGHTS: Stores basic metadata about each ICP
create table app.spotlights (
  spotlight_id bigint identity primary key,
  org_id       int not null,
  name         nvarchar(255) not null,
  domain       nvarchar(100) not null, -- e.g., 'tech', 'healthcare'
  description  nvarchar(1000) null,
  active       bit not null default 1,
  created_at   datetime2 not null default sysdatetime(),
  updated_at   datetime2 not null default sysdatetime(),
  row_version  rowversion
);
create index IX_spotlights_org_domain on app.spotlights(org_id, domain);
create index IX_spotlights_org_active on app.spotlights(org_id, active);

-- SPOTLIGHT_FIELDS: Defines the custom fields available for a spotlight
create table app.spotlight_fields (
  field_id      bigint identity primary key,
  org_id        int not null,
  domain        nvarchar(100) not null,
  field_name    nvarchar(255) not null,
  field_type    nvarchar(50) not null check (field_type in ('text','number','boolean','enum','date')),
  is_required   bit not null default 0,
  display_order int not null default 0,
  enum_values   nvarchar(max) null, -- JSON array for enum options
  created_at    datetime2 not null default sysdatetime(),
  row_version   rowversion
);
create index IX_spotlight_fields_org_domain on app.spotlight_fields(org_id, domain);
create unique index UX_spotlight_fields_org_domain_name on app.spotlight_fields(org_id, domain, field_name);

-- SPOTLIGHT_VALUES: Stores the actual values per spotlight for each custom field
create table app.spotlight_values (
  value_id     bigint identity primary key,
  org_id       int not null,
  spotlight_id bigint not null,
  field_id     bigint not null,
  field_value  nvarchar(max) null,
  created_at   datetime2 not null default sysdatetime(),
  updated_at   datetime2 not null default sysdatetime(),
  row_version  rowversion,
  foreign key (spotlight_id) references app.spotlights(spotlight_id),
  foreign key (field_id) references app.spotlight_fields(field_id)
);
create index IX_spotlight_values_org_spotlight on app.spotlight_values(org_id, spotlight_id);
create index IX_spotlight_values_org_field on app.spotlight_values(org_id, field_id);

-- SPOTLIGHT_FIELD_RULES: Stores conditional logic for fields
create table app.spotlight_field_rules (
  rule_id            bigint identity primary key,
  org_id             int not null,
  field_id           bigint not null,
  condition_field_id bigint not null,
  operator           nvarchar(10) not null check (operator in ('=','!=','>','<','>=','<=','contains')),
  condition_value    nvarchar(255) not null,
  created_at         datetime2 not null default sysdatetime(),
  row_version        rowversion,
  foreign key (field_id) references app.spotlight_fields(field_id),
  foreign key (condition_field_id) references app.spotlight_fields(field_id)
);
create index IX_spotlight_field_rules_org_field on app.spotlight_field_rules(org_id, field_id);

-- Add events for spotlight changes
-- Assuming app.work_event exists, but to integrate, we can add event types like 'spotlight_created', 'spotlight_updated'