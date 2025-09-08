-- Migration: Add Principal Identity & Comms Hub Modules
-- Date: 2025-09-08
-- This script introduces a provider-agnostic identity model and the full Comms Hub schema.
-- It is designed to integrate with the existing event sourcing (app.work_event) and SLA patterns.

------------------------------------------------------------
-- Identity (provider-agnostic)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='principal' AND xtype='U')
create table app.principal (
  principal_id     bigint identity primary key,
  org_id           int not null,
  principal_type   varchar(16) not null check (principal_type in ('person','service','team')),
  display_name     nvarchar(200) null,
  primary_email    nvarchar(256) null,
  is_internal      bit not null default 0,
  is_active        bit not null default 1,
  created_at       datetime2 not null default sysdatetime(),
  updated_at       datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_principal_org_email')
create unique index UX_principal_org_email on app.principal(org_id, primary_email) where primary_email is not null;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='principal_identity' AND xtype='U')
create table app.principal_identity (
  identity_id      bigint identity primary key,
  principal_id     bigint not null,
  provider         varchar(16) not null check (provider in ('aad','email','custom')),
  subject          nvarchar(256) not null,     -- e.g., AAD objectId or raw email
  tenant_id        nvarchar(64) null,          -- AAD tenant id when provider='aad'
  created_at       datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_identity_provider_subject')
create unique index UX_identity_provider_subject on app.principal_identity(provider, subject);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_identity_principal' AND xtype='F')
alter table app.principal_identity
  add constraint FK_identity_principal foreign key (principal_id) references app.principal(principal_id);

------------------------------------------------------------
-- Mailboxes (user + shared), module-scoped
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_mailbox' AND xtype='U')
create table app.comms_mailbox (
  mailbox_id          int identity primary key,
  org_id              int not null,
  mailbox_type        varchar(10) not null check (mailbox_type in ('user','shared')),
  module_code         nvarchar(32) null,
  address             nvarchar(256) not null,
  graph_user_id       varchar(128) null,
  owner_principal_id  bigint null,
  default_sla_rule_id int null,
  active              bit not null default 1,
  created_at          datetime2 not null default sysdatetime(),
  updated_at          datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_mailbox_org_addr')
create unique index UX_mailbox_org_addr on app.comms_mailbox(org_id, address);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_mailbox_owner' AND xtype='F')
alter table app.comms_mailbox
  add constraint FK_mailbox_owner foreign key (owner_principal_id) references app.principal(principal_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_mailbox_sla' AND xtype='F')
alter table app.comms_mailbox
  add constraint FK_mailbox_sla foreign key (default_sla_rule_id) references app.sla_rule(rule_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_mailbox_member' AND xtype='U')
create table app.comms_mailbox_member (
  mailbox_id    int not null,
  principal_id  bigint not null,
  role          varchar(12) not null check (role in ('owner','member','viewer')),
  added_at      datetime2 not null default sysdatetime(),
  primary key (mailbox_id, principal_id)
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_mailbox_member_mailbox' AND xtype='F')
alter table app.comms_mailbox_member
  add constraint FK_mailbox_member_mailbox foreign key (mailbox_id) references app.comms_mailbox(mailbox_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_mailbox_member_principal' AND xtype='F')
alter table app.comms_mailbox_member
  add constraint FK_mailbox_member_principal foreign key (principal_id) references app.principal(principal_id);

------------------------------------------------------------
-- Graph subscriptions (per mailbox)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_subscription' AND xtype='U')
create table app.comms_subscription (
  subscription_id   int identity primary key,
  org_id            int not null,
  mailbox_id        int not null,
  provider          varchar(16) not null default 'graph',
  provider_sub_id   varchar(128) not null,
  resource          varchar(200) not null,
  expires_at        datetime2 not null,
  state             varchar(16) not null default 'active',
  created_at        datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_subscription_provider')
create unique index UX_subscription_provider on app.comms_subscription(provider, provider_sub_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_subscription_mailbox' AND xtype='F')
alter table app.comms_subscription
  add constraint FK_subscription_mailbox foreign key (mailbox_id) references app.comms_mailbox(mailbox_id);

------------------------------------------------------------
-- Threads (with processing states + principal assignment)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_thread' AND xtype='U')
create table app.comms_thread (
  thread_id         bigint identity primary key,
  org_id            int not null,
  mailbox_id        int not null,
  channel           varchar(16) not null check (channel in ('email','ticket')),
  subject           nvarchar(500) not null,
  status            varchar(20) not null check (status in ('open','waiting_on_us','waiting_on_client','closed')),
  process_state     varchar(20) not null default 'triage' check (process_state in ('triage','in_processing','queued','done','archived')),
  assigned_principal_id bigint null,
  client_id         int null,
  sla_rule_id       int null,
  first_msg_at      datetime2 null,
  last_msg_at       datetime2 not null default sysdatetime(),
  internet_conv_id  varchar(256) null,
  created_at        datetime2 not null default sysdatetime(),
  updated_at        datetime2 not null default sysdatetime(),
  row_version       rowversion
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_thread_conv')
create unique index UX_thread_conv on app.comms_thread(org_id, mailbox_id, internet_conv_id) where internet_conv_id is not null;
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_thread_org_proc_status')
create index IX_thread_org_proc_status on app.comms_thread(org_id, process_state, status, last_msg_at desc);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_mailbox' AND xtype='F')
alter table app.comms_thread
  add constraint FK_thread_mailbox foreign key (mailbox_id) references app.comms_mailbox(mailbox_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_client' AND xtype='F')
alter table app.comms_thread
  add constraint FK_thread_client foreign key (client_id) references app.clients(client_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_sla' AND xtype='F')
alter table app.comms_thread
  add constraint FK_thread_sla foreign key (sla_rule_id) references app.sla_rule(rule_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_assignee' AND xtype='F')
alter table app.comms_thread
  add constraint FK_thread_assignee foreign key (assigned_principal_id) references app.principal(principal_id);

------------------------------------------------------------
-- Messages & Attachments
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_message' AND xtype='U')
create table app.comms_message (
  message_id        bigint identity primary key,
  org_id            int not null,
  thread_id         bigint not null,
  direction         varchar(3) not null check (direction in ('in','out')),
  provider          varchar(16) not null check (provider in ('graph','zammad')),
  provider_msg_id   varchar(256) not null,
  internet_msg_id   varchar(256) null,
  from_addr         nvarchar(256) null,
  to_addrs_json     nvarchar(max) null,
  sent_at           datetime2 not null,
  snippet           nvarchar(1000) null,
  body_blob_url     varchar(512) null,
  has_attachments   bit not null default 0,
  created_at        datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_message_provider')
create unique index UX_message_provider on app.comms_message(org_id, provider, provider_msg_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_message_thread' AND xtype='F')
alter table app.comms_message
  add constraint FK_message_thread foreign key (thread_id) references app.comms_thread(thread_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_attachment' AND xtype='U')
create table app.comms_attachment (
  attachment_id         bigint identity primary key,
  org_id                int not null,
  message_id            bigint not null,
  name                  nvarchar(260) not null,
  mime_type             varchar(128) null,
  size_bytes            int null,
  provider_attachment_id varchar(256) null,
  blob_url              varchar(512) null,
  created_at            datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_attach_message' AND xtype='F')
alter table app.comms_attachment
  add constraint FK_attach_message foreign key (message_id) references app.comms_message(message_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_attachment_doc' AND xtype='U')
create table app.comms_attachment_doc (
  link_id           bigint identity primary key,
  org_id            int not null,
  attachment_id     bigint not null,
  doc_ref           varchar(256) not null,
  created_at        datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_attach_doc')
create unique index UX_attach_doc on app.comms_attachment_doc(attachment_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_attachdoc_attachment' AND xtype='F')
alter table app.comms_attachment_doc
  add constraint FK_attachdoc_attachment foreign key (attachment_id) references app.comms_attachment(attachment_id);

------------------------------------------------------------
-- Sync Mapping & Tagging
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_thread_map' AND xtype='U')
create table app.comms_thread_map (
  map_id              bigint identity primary key,
  org_id              int not null,
  mailbox_id          int not null,
  thread_id           bigint not null,
  provider            varchar(16) not null default 'graph',
  provider_thread_id  varchar(256) not null,
  delta_link          varchar(512) null,
  last_sync_at        datetime2 not null default sysdatetime()
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_thread_map')
create unique index UX_thread_map on app.comms_thread_map(org_id, provider, mailbox_id, provider_thread_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_map_mailbox' AND xtype='F')
alter table app.comms_thread_map
  add constraint FK_thread_map_mailbox foreign key (mailbox_id) references app.comms_mailbox(mailbox_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thread_map_thread' AND xtype='F')
alter table app.comms_thread_map
  add constraint FK_thread_map_thread foreign key (thread_id) references app.comms_thread(thread_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_tag' AND xtype='U')
create table app.comms_tag (
  tag_id       int identity primary key,
  org_id       int not null,
  name         nvarchar(100) not null,
  color_hex    char(7) null
);
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_tag_org_name')
create unique index UX_tag_org_name on app.comms_tag(org_id, name);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_thread_tag' AND xtype='U')
create table app.comms_thread_tag (
  thread_id    bigint not null,
  tag_id       int not null,
  primary key (thread_id, tag_id)
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thr_tag_thread' AND xtype='F')
alter table app.comms_thread_tag
  add constraint FK_thr_tag_thread foreign key (thread_id) references app.comms_thread(thread_id);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_thr_tag_tag' AND xtype='F')
alter table app.comms_thread_tag
  add constraint FK_thr_tag_tag foreign key (tag_id) references app.comms_tag(tag_id);
