-- Migration: Communication Hub Enhancements
-- Date: 2025-09-08
-- Adds WebSocket connections, email templates, and enhanced search capabilities

------------------------------------------------------------
-- WebSocket Connections (for real-time updates)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_websocket_connection' AND xtype='U')
CREATE TABLE app.comms_websocket_connection (
  connection_id     BIGINT IDENTITY PRIMARY KEY,
  org_id            INT NOT NULL,
  principal_id      BIGINT NOT NULL,
  socket_id         VARCHAR(128) NOT NULL,
  user_agent        NVARCHAR(500) NULL,
  ip_address        VARCHAR(45) NULL,
  connected_at      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  last_ping_at      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  is_active         BIT NOT NULL DEFAULT 1
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_websocket_socket')
CREATE UNIQUE INDEX UX_websocket_socket ON app.comms_websocket_connection(socket_id);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_websocket_principal_active')
CREATE INDEX IX_websocket_principal_active ON app.comms_websocket_connection(principal_id, is_active);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_websocket_principal' AND xtype='F')
ALTER TABLE app.comms_websocket_connection
  ADD CONSTRAINT FK_websocket_principal FOREIGN KEY (principal_id) REFERENCES app.principal(principal_id);

------------------------------------------------------------
-- WebSocket Subscriptions (what each connection is subscribed to)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_websocket_subscription' AND xtype='U')
CREATE TABLE app.comms_websocket_subscription (
  subscription_id   BIGINT IDENTITY PRIMARY KEY,
  connection_id     BIGINT NOT NULL,
  subscription_type VARCHAR(32) NOT NULL CHECK (subscription_type IN ('thread', 'mailbox', 'all_threads')),
  resource_id       BIGINT NULL,  -- thread_id for thread subscriptions, mailbox_id for mailbox subscriptions
  created_at        DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_websocket_sub_connection')
CREATE INDEX IX_websocket_sub_connection ON app.comms_websocket_subscription(connection_id);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_websocket_sub_type_resource')
CREATE INDEX IX_websocket_sub_type_resource ON app.comms_websocket_subscription(subscription_type, resource_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_websocket_sub_connection' AND xtype='F')
ALTER TABLE app.comms_websocket_subscription
  ADD CONSTRAINT FK_websocket_sub_connection FOREIGN KEY (connection_id) REFERENCES app.comms_websocket_connection(connection_id);

------------------------------------------------------------
-- Email Templates
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_email_template' AND xtype='U')
CREATE TABLE app.comms_email_template (
  template_id       BIGINT IDENTITY PRIMARY KEY,
  org_id            INT NOT NULL,
  name              NVARCHAR(200) NOT NULL,
  subject_template  NVARCHAR(500) NOT NULL,
  body_template     NVARCHAR(MAX) NOT NULL,
  template_type     VARCHAR(32) NOT NULL DEFAULT 'general' CHECK (template_type IN ('general', 'response', 'followup', 'closure')),
  is_active         BIT NOT NULL DEFAULT 1,
  created_by        BIGINT NOT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_at        DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_email_template_org_name')
CREATE UNIQUE INDEX UX_email_template_org_name ON app.comms_email_template(org_id, name);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_email_template_type_active')
CREATE INDEX IX_email_template_type_active ON app.comms_email_template(org_id, template_type, is_active);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_email_template_creator' AND xtype='F')
ALTER TABLE app.comms_email_template
  ADD CONSTRAINT FK_email_template_creator FOREIGN KEY (created_by) REFERENCES app.principal(principal_id);

------------------------------------------------------------
-- Template Variables (for dynamic content)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_template_variable' AND xtype='U')
CREATE TABLE app.comms_template_variable (
  variable_id       BIGINT IDENTITY PRIMARY KEY,
  template_id       BIGINT NOT NULL,
  variable_name     VARCHAR(100) NOT NULL,
  variable_type     VARCHAR(32) NOT NULL DEFAULT 'text' CHECK (variable_type IN ('text', 'number', 'date', 'boolean')),
  default_value     NVARCHAR(500) NULL,
  description       NVARCHAR(500) NULL,
  is_required       BIT NOT NULL DEFAULT 0
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_template_variable_template')
CREATE INDEX IX_template_variable_template ON app.comms_template_variable(template_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_template_variable_template' AND xtype='F')
ALTER TABLE app.comms_template_variable
  ADD CONSTRAINT FK_template_variable_template FOREIGN KEY (template_id) REFERENCES app.comms_email_template(template_id);

------------------------------------------------------------
-- Full-text Search Setup (for messages and threads)
------------------------------------------------------------

-- Create full-text catalog if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.fulltext_catalogs WHERE name = 'FT_Comms_Catalog')
CREATE FULLTEXT CATALOG FT_Comms_Catalog;

-- Create unique index for thread full-text search
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_thread_fts')
CREATE UNIQUE INDEX UX_thread_fts ON app.comms_thread(thread_id);

-- Create full-text index on comms_thread for subject search
IF NOT EXISTS (SELECT * FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('app.comms_thread'))
CREATE FULLTEXT INDEX ON app.comms_thread (
  subject LANGUAGE 1033  -- English
)
KEY INDEX UX_thread_fts
ON FT_Comms_Catalog;

-- Create unique index for message full-text search
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_message_fts')
CREATE UNIQUE INDEX UX_message_fts ON app.comms_message(message_id);

-- Create full-text index on comms_message for content search
IF NOT EXISTS (SELECT * FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('app.comms_message'))
CREATE FULLTEXT INDEX ON app.comms_message (
  snippet LANGUAGE 1033,  -- English
  from_addr LANGUAGE 1033
)
KEY INDEX UX_message_fts
ON FT_Comms_Catalog;

------------------------------------------------------------
-- Search History (for analytics and optimization)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_search_history' AND xtype='U')
CREATE TABLE app.comms_search_history (
  search_id         BIGINT IDENTITY PRIMARY KEY,
  org_id            INT NOT NULL,
  principal_id      BIGINT NOT NULL,
  search_query      NVARCHAR(1000) NOT NULL,
  search_type       VARCHAR(32) NOT NULL DEFAULT 'general' CHECK (search_type IN ('general', 'thread', 'message', 'attachment')),
  result_count      INT NOT NULL DEFAULT 0,
  search_duration_ms INT NULL,
  searched_at       DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_search_history_principal')
CREATE INDEX IX_search_history_principal ON app.comms_search_history(principal_id, searched_at DESC);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_search_history_org')
CREATE INDEX IX_search_history_org ON app.comms_search_history(org_id, searched_at DESC);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_search_history_principal' AND xtype='F')
ALTER TABLE app.comms_search_history
  ADD CONSTRAINT FK_search_history_principal FOREIGN KEY (principal_id) REFERENCES app.principal(principal_id);

------------------------------------------------------------
-- File Upload Sessions (for resumable uploads)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_upload_session' AND xtype='U')
CREATE TABLE app.comms_upload_session (
  session_id         VARCHAR(128) PRIMARY KEY,
  org_id             INT NOT NULL,
  principal_id       BIGINT NOT NULL,
  thread_id          BIGINT NULL,
  filename           NVARCHAR(260) NOT NULL,
  mime_type          VARCHAR(128) NULL,
  total_size_bytes   BIGINT NOT NULL,
  uploaded_bytes     BIGINT NOT NULL DEFAULT 0,
  status             VARCHAR(16) NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'completed', 'failed', 'cancelled')),
  expires_at         DATETIME2 NOT NULL,
  created_at         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_at         DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_upload_session_principal')
CREATE INDEX IX_upload_session_principal ON app.comms_upload_session(principal_id, status);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_upload_session_expires')
CREATE INDEX IX_upload_session_expires ON app.comms_upload_session(expires_at);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_upload_session_principal' AND xtype='F')
ALTER TABLE app.comms_upload_session
  ADD CONSTRAINT FK_upload_session_principal FOREIGN KEY (principal_id) REFERENCES app.principal(principal_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_upload_session_thread' AND xtype='F')
ALTER TABLE app.comms_upload_session
  ADD CONSTRAINT FK_upload_session_thread FOREIGN KEY (thread_id) REFERENCES app.comms_thread(thread_id);

------------------------------------------------------------
-- Notification Preferences (per principal)
------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='comms_notification_preference' AND xtype='U')
CREATE TABLE app.comms_notification_preference (
  preference_id      BIGINT IDENTITY PRIMARY KEY,
  principal_id       BIGINT NOT NULL,
  notification_type  VARCHAR(32) NOT NULL CHECK (notification_type IN ('new_message', 'status_change', 'assignment', 'sla_breach')),
  channel            VARCHAR(16) NOT NULL DEFAULT 'websocket' CHECK (channel IN ('websocket', 'email', 'push')),
  is_enabled         BIT NOT NULL DEFAULT 1,
  created_at         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_at         DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='UX_notification_pref_principal_type')
CREATE UNIQUE INDEX UX_notification_pref_principal_type ON app.comms_notification_preference(principal_id, notification_type, channel);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FK_notification_pref_principal' AND xtype='F')
ALTER TABLE app.comms_notification_preference
  ADD CONSTRAINT FK_notification_pref_principal FOREIGN KEY (principal_id) REFERENCES app.principal(principal_id);

------------------------------------------------------------
-- Add missing indexes for performance
------------------------------------------------------------

-- Index for attachment lookups
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_attachment_message')
CREATE INDEX IX_attachment_message ON app.comms_attachment(message_id);

-- Index for thread message counts
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_message_thread_sent')
CREATE INDEX IX_message_thread_sent ON app.comms_message(thread_id, sent_at DESC);

-- Index for mailbox threads
IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_thread_mailbox_status')
CREATE INDEX IX_thread_mailbox_status ON app.comms_thread(mailbox_id, status, last_msg_at DESC);
