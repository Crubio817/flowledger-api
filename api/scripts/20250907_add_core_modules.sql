/* Create core/modules schemas and tables for modular system with scope flag */
PRINT 'Starting core/modules schema migration';
GO

/* Schemas */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core')
BEGIN
  EXEC('CREATE SCHEMA core');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'modules')
BEGIN
  EXEC('CREATE SCHEMA modules');
END
GO

/* Organizations */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='core' AND t.name='organizations')
BEGIN
  CREATE TABLE core.organizations (
      org_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_core_organizations_org_id DEFAULT NEWID() PRIMARY KEY,
      name NVARCHAR(200) NOT NULL,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_organizations_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

/* Clients (UUID) */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='core' AND t.name='clients')
BEGIN
  CREATE TABLE core.clients (
      client_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_core_clients_client_id DEFAULT NEWID() PRIMARY KEY,
      org_id UNIQUEIDENTIFIER NOT NULL,
      name NVARCHAR(200) NOT NULL,
      status VARCHAR(30) NOT NULL CONSTRAINT DF_core_clients_status DEFAULT 'active',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_clients_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_core_clients_org FOREIGN KEY (org_id) REFERENCES core.organizations(org_id)
  );
  CREATE INDEX IX_core_clients_org ON core.clients(org_id);
END
GO

/* Module registry */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module')
BEGIN
  CREATE TABLE modules.module (
      module_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_id DEFAULT NEWID() PRIMARY KEY,
      [key] VARCHAR(100) NOT NULL UNIQUE,
      name NVARCHAR(200) NOT NULL,
      description NVARCHAR(1000) NULL,
      scope VARCHAR(30) NOT NULL CONSTRAINT DF_modules_module_scope DEFAULT 'external',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_modules_module_scope CHECK (scope IN ('internal','external','hybrid'))
  );
END
GO

/* Module versions */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_version')
BEGIN
  CREATE TABLE modules.module_version (
      module_version_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_version_id DEFAULT NEWID() PRIMARY KEY,
      module_id UNIQUEIDENTIFIER NOT NULL,
      semver VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL CONSTRAINT DF_modules_module_version_status DEFAULT 'released',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_version_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_modules_module_version UNIQUE(module_id, semver),
      CONSTRAINT CK_modules_module_version_status CHECK (status IN ('draft','released','deprecated')),
      CONSTRAINT FK_modules_module_version_module FOREIGN KEY (module_id) REFERENCES modules.module(module_id)
  );
  CREATE INDEX IX_modules_module_version_module ON modules.module_version(module_id);
END
GO

/* Module instances (client references app.clients INT id) */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_instance')
BEGIN
  CREATE TABLE modules.module_instance (
      module_instance_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_instance_id DEFAULT NEWID() PRIMARY KEY,
      module_id UNIQUEIDENTIFIER NOT NULL,
      module_version_id UNIQUEIDENTIFIER NULL,
      client_id INT NOT NULL,
      is_enabled BIT NOT NULL CONSTRAINT DF_modules_module_instance_is_enabled DEFAULT 1,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_instance_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_modules_module_instance_module FOREIGN KEY (module_id) REFERENCES modules.module(module_id),
      CONSTRAINT FK_modules_module_instance_version FOREIGN KEY (module_version_id) REFERENCES modules.module_version(module_version_id),
      CONSTRAINT FK_modules_module_instance_client FOREIGN KEY (client_id) REFERENCES app.clients(client_id)
  );
  CREATE INDEX IX_modules_module_instance_module ON modules.module_instance(module_id);
  CREATE INDEX IX_modules_module_instance_client ON modules.module_instance(client_id);
END
GO

/* Module config */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_config')
BEGIN
  CREATE TABLE modules.module_config (
      module_config_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_config_id DEFAULT NEWID() PRIMARY KEY,
      module_instance_id UNIQUEIDENTIFIER NOT NULL,
      cfg_json NVARCHAR(MAX) NOT NULL,
      secrets_ref NVARCHAR(200) NULL,
      is_active BIT NOT NULL CONSTRAINT DF_modules_module_config_is_active DEFAULT 1,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_config_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_modules_module_config_instance FOREIGN KEY (module_instance_id) REFERENCES modules.module_instance(module_instance_id)
  );
  CREATE INDEX IX_modules_module_config_instance ON modules.module_config(module_instance_id);
END
GO

/* Optional: enforcement stub for internal-only modules (replace YOUR_ORG_ID to enable)
-- ALTER TABLE modules.module_instance ADD CONSTRAINT CK_internal_instance
-- CHECK (
--   NOT EXISTS (
--     SELECT 1 FROM modules.module m
--     WHERE m.module_id = module_instance.module_id
--       AND m.scope = 'internal'
--       AND module_instance.client_id NOT IN (
--         SELECT c.client_id FROM core.clients c WHERE c.org_id = 'YOUR_ORG_ID_HERE'
--       )
--   )
-- );
*/

PRINT 'Completed core/modules schema migration';
GO

/* ==========================================
   BILLING & CONTRACTS MODULE TABLES
   ========================================== */

-- Note: Contract table extensions are handled separately
-- Contract milestones for milestone-based billing
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='contract_milestone' AND xtype='U')
BEGIN
    CREATE TABLE app.contract_milestone (
        contract_milestone_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        contract_id BIGINT NOT NULL,
        milestone_id BIGINT, -- Links to engagement milestone
        name NVARCHAR(200) NOT NULL,
        description NVARCHAR(500),
        amount DECIMAL(12,2) NOT NULL,
        trigger_type VARCHAR(20) NOT NULL DEFAULT 'completion' CHECK (trigger_type IN ('completion', 'date', 'manual', 'pct_complete')),
        trigger_value NVARCHAR(100), -- JSON for complex triggers
        due_at DATETIME2,
        completed_at DATETIME2,
        taxable BIT NOT NULL DEFAULT 1,
        tax_code VARCHAR(20),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'billed', 'paid')),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Payments with multi-currency support
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payment' AND xtype='U')
BEGIN
    CREATE TABLE app.payment (
        payment_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        invoice_id BIGINT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        exchange_rate DECIMAL(10,6) DEFAULT 1.0,
        amount_base DECIMAL(12,2) NOT NULL, -- Amount in org base currency
        payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('bank_transfer', 'credit_card', 'check', 'wire', 'ach', 'paypal', 'other')),
        payment_date DATETIME2 NOT NULL,
        received_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        reference_number NVARCHAR(100),
        notes NVARCHAR(500),
        processed_by BIGINT,
        status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Invoice line items with detailed breakdown
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='invoice_line_item' AND xtype='U')
BEGIN
    CREATE TABLE app.invoice_line_item (
        invoice_line_item_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        invoice_id BIGINT NOT NULL,
        line_type VARCHAR(20) NOT NULL CHECK (line_type IN ('time', 'milestone', 'retainer', 'prepaid', 'expense', 'adjustment', 'tax')),
        description NVARCHAR(500) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        line_total DECIMAL(12,2) NOT NULL,
        tax_amount DECIMAL(12,2) DEFAULT 0,
        tax_code VARCHAR(20),
        taxable BIT NOT NULL DEFAULT 1,
        -- Link to source data
        time_entry_id BIGINT,
        milestone_id BIGINT,
        assignment_id BIGINT,
        expense_id BIGINT,
        period_start DATE,
        period_end DATE,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

PRINT 'Basic billing tables created successfully';

/* ==========================================
   AUTOMATION MODULE TABLES
   ========================================== */

-- 1) Enhance work_event table for proper outbox pattern
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'claimed_at')
BEGIN
    ALTER TABLE app.work_event ADD claimed_at DATETIME2 NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'claimed_by')
BEGIN
    ALTER TABLE app.work_event ADD claimed_by VARCHAR(64) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'dead_letter_at')
BEGIN
    ALTER TABLE app.work_event ADD dead_letter_at DATETIME2 NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'retry_count')
BEGIN
    ALTER TABLE app.work_event ADD retry_count INT NOT NULL DEFAULT 0;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'max_attempts')
BEGIN
    ALTER TABLE app.work_event ADD max_attempts INT NOT NULL DEFAULT 3;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'correlation_id')
BEGIN
    ALTER TABLE app.work_event ADD correlation_id VARCHAR(36) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'dedupe_key')
BEGIN
    ALTER TABLE app.work_event ADD dedupe_key VARCHAR(128) NULL;
END

-- Add indexes for outbox pattern
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.work_event') AND name = 'IX_work_event_unprocessed')
BEGIN
    CREATE INDEX IX_work_event_unprocessed ON app.work_event(claimed_at, processed_at) WHERE processed_at IS NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.work_event') AND name = 'IX_work_event_dedupe')
BEGIN
    CREATE INDEX IX_work_event_dedupe ON app.work_event(org_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
END

-- 2) Automation tables
-- Events table (normalized event envelope)
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_event')
BEGIN
    CREATE TABLE app.automation_event (
        event_id VARCHAR(36) NOT NULL PRIMARY KEY DEFAULT NEWID(),
        type VARCHAR(100) NOT NULL,
        occurred_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        tenant_id INT NOT NULL, -- org_id
        aggregate_type VARCHAR(50) NULL,
        aggregate_id BIGINT NULL,
        version INT NULL,
        payload_json NVARCHAR(MAX) NULL,
        source VARCHAR(50) NOT NULL, -- 'domain' or 'provider'
        correlation_id VARCHAR(36) NULL,
        dedupe_key VARCHAR(128) NULL,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_automation_event_tenant_type ON app.automation_event(tenant_id, type);
    CREATE INDEX IX_automation_event_correlation ON app.automation_event(correlation_id);
    CREATE INDEX IX_automation_event_dedupe ON app.automation_event(tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
END

-- Rules table
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_rule')
BEGIN
    CREATE TABLE app.automation_rule (
        rule_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        tenant_id INT NOT NULL,
        name NVARCHAR(200) NOT NULL,
        is_enabled BIT NOT NULL DEFAULT 1,
        trigger_json NVARCHAR(MAX) NOT NULL, -- JSON: {event_types[], schedule?}
        conditions_json NVARCHAR(MAX) NULL, -- JSON-logic
        throttle_per VARCHAR(20) NULL, -- 'minute', 'hour', 'day'
        throttle_limit INT NULL,
        actions_json NVARCHAR(MAX) NOT NULL, -- JSON array of actions
        created_by BIGINT NULL,
        updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_automation_rule_tenant ON app.automation_rule(tenant_id);
    CREATE INDEX IX_automation_rule_enabled ON app.automation_rule(tenant_id, is_enabled);
END

-- Action catalog
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_action_catalog')
BEGIN
    CREATE TABLE app.automation_action_catalog (
        action_type VARCHAR(100) NOT NULL PRIMARY KEY,
        config_schema NVARCHAR(MAX) NULL, -- JSON schema for action config
        permissions_required NVARCHAR(MAX) NULL, -- JSON array of required permissions
        description NVARCHAR(500) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END

-- Action jobs queue
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_job')
BEGIN
    CREATE TABLE app.automation_job (
        job_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        rule_id BIGINT NOT NULL,
        event_id VARCHAR(36) NULL,
        action_type VARCHAR(100) NOT NULL,
        payload_json NVARCHAR(MAX) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        next_run_at DATETIME2(3) NULL,
        idempotency_key VARCHAR(128) NULL,
        provider_ids NVARCHAR(MAX) NULL, -- JSON: {email_id, invoice_id, etc.}
        error_message NVARCHAR(1000) NULL,
        started_at DATETIME2(3) NULL,
        finished_at DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_automation_job_rule FOREIGN KEY (rule_id) REFERENCES app.automation_rule(rule_id)
    );
    CREATE INDEX IX_automation_job_status ON app.automation_job(status, next_run_at);
    CREATE INDEX IX_automation_job_rule ON app.automation_job(rule_id);
    CREATE INDEX IX_automation_job_idempotency ON app.automation_job(idempotency_key);
END

-- Automation logs
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_log')
BEGIN
    CREATE TABLE app.automation_log (
        log_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        event_id VARCHAR(36) NULL,
        rule_id BIGINT NULL,
        job_id BIGINT NULL,
        outcome VARCHAR(20) NOT NULL, -- 'triggered', 'filtered', 'executed', 'failed'
        started_at DATETIME2(3) NULL,
        finished_at DATETIME2(3) NULL,
        metrics_json NVARCHAR(MAX) NULL, -- JSON: {attempts, latency_ms, etc.}
        error_message NVARCHAR(1000) NULL,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_automation_log_rule FOREIGN KEY (rule_id) REFERENCES app.automation_rule(rule_id),
        CONSTRAINT FK_automation_log_job FOREIGN KEY (job_id) REFERENCES app.automation_job(job_id)
    );
    CREATE INDEX IX_automation_log_event ON app.automation_log(event_id);
    CREATE INDEX IX_automation_log_rule ON app.automation_log(rule_id);
END

-- Schedules for time-based rules
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='app' AND t.name='automation_schedule')
BEGIN
    CREATE TABLE app.automation_schedule (
        schedule_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        tenant_id INT NOT NULL,
        rule_id BIGINT NOT NULL,
        cron_expression VARCHAR(100) NULL,
        rrule_expression NVARCHAR(500) NULL,
        timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
        params_json NVARCHAR(MAX) NULL, -- JSON parameters for the schedule
        next_run_at DATETIME2(3) NULL,
        last_run_at DATETIME2(3) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_automation_schedule_rule FOREIGN KEY (rule_id) REFERENCES app.automation_rule(rule_id)
    );
    CREATE INDEX IX_automation_schedule_tenant ON app.automation_schedule(tenant_id);
    CREATE INDEX IX_automation_schedule_next_run ON app.automation_schedule(next_run_at) WHERE is_active = 1;
END

-- 3) Seed action catalog
INSERT INTO app.automation_action_catalog (action_type, config_schema, permissions_required, description)
SELECT action_type, config_schema, permissions_required, description
FROM (VALUES
('comms.draft_reply', '{"type":"object","properties":{"template":{"type":"string"},"thread_from":{"type":"string"},"engagement_id":{"type":"number"}}}', '["comms.write"]', 'Draft a reply in a communication thread'),
('comms.send_email', '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"template":{"type":"string"}}}', '["comms.send"]', 'Send an email message'),
('comms.set_status', '{"type":"object","properties":{"thread_id":{"type":"string"},"status":{"type":"string","enum":["waiting_on_us","waiting_on_client","resolved"]}}}', '["comms.write"]', 'Update thread status'),
('comms.escalate', '{"type":"object","properties":{"thread_id":{"type":"string"},"priority":{"type":"string"},"assignee":{"type":"string"}}}', '["comms.escalate"]', 'Escalate a communication thread'),
('workstream.create_candidate', '{"type":"object","properties":{"signal_id":{"type":"number"},"name":{"type":"string"},"email":{"type":"string"}}}', '["workstream.write"]', 'Create a new candidate from signal'),
('workstream.promote_to_pursuit', '{"type":"object","properties":{"candidate_id":{"type":"number"},"pursuit_stage":{"type":"string"}}}', '["workstream.write"]', 'Promote candidate to pursuit'),
('engagements.create_task', '{"type":"object","properties":{"engagement_id":{"type":"number"},"title":{"type":"string"},"assignee_id":{"type":"number"}}}', '["engagements.write"]', 'Create a new task in engagement'),
('engagements.update_state', '{"type":"object","properties":{"engagement_id":{"type":"number"},"feature_id":{"type":"number"},"new_state":{"type":"string"}}}', '["engagements.write"]', 'Update feature or engagement state'),
('engagements.generate_report_doc', '{"type":"object","properties":{"engagement_id":{"type":"number"},"template":{"type":"string"},"format":{"type":"string","enum":["pdf","docx"]}}}', '["engagements.write","docs.write"]', 'Generate report document'),
('docs.render_template', '{"type":"object","properties":{"template_id":{"type":"string"},"data":{"type":"object"},"format":{"type":"string"}}}', '["docs.write"]', 'Render a document template'),
('docs.approve_version', '{"type":"object","properties":{"document_id":{"type":"string"},"version":{"type":"string"}}}', '["docs.approve"]', 'Approve a document version'),
('docs.share_link', '{"type":"object","properties":{"document_id":{"type":"string"},"recipients":{"type":"array"},"permissions":{"type":"string"}}}', '["docs.share"]', 'Share document with link'),
('billing.create_invoice', '{"type":"object","properties":{"contract_id":{"type":"number"},"line_items":{"type":"array"},"due_date":{"type":"string"}}}', '["billing.write"]', 'Create a new invoice'),
('billing.add_milestone_line', '{"type":"object","properties":{"engagement_id":{"type":"number"},"feature_id":{"type":"number"},"amount":{"type":"number"}}}', '["billing.write"]', 'Add milestone line to invoice'),
('billing.post_invoice', '{"type":"object","properties":{"invoice_id":{"type":"number"},"send_notification":{"type":"boolean"}}}', '["billing.post"]', 'Post an invoice'),
('billing.send_dunning', '{"type":"object","properties":{"invoice_id":{"type":"number"},"level":{"type":"string","enum":["reminder","warning","final"]}}}', '["billing.send"]', 'Send dunning notice'),
('people.create_staffing_request', '{"type":"object","properties":{"role":{"type":"string"},"skills":{"type":"array"},"urgency":{"type":"string"}}}', '["people.write"]', 'Create staffing request'),
('people.rank_candidates', '{"type":"object","properties":{"request_id":{"type":"number"},"candidates":{"type":"array"}}}', '["people.write"]', 'Rank candidates for request'),
('people.create_assignment', '{"type":"object","properties":{"request_id":{"type":"number"},"candidate_id":{"type":"number"},"start_date":{"type":"string"}}}', '["people.write"]', 'Create resource assignment'),
('automation.schedule_followup', '{"type":"object","properties":{"delay_minutes":{"type":"number"},"action":{"type":"object"}}}', '["automation.write"]', 'Schedule a followup action'),
('automation.emit_event', '{"type":"object","properties":{"event_type":{"type":"string"},"payload":{"type":"object"}}}', '["automation.write"]', 'Emit a custom event'),
('automation.call_webhook', '{"type":"object","properties":{"url":{"type":"string"},"method":{"type":"string"},"headers":{"type":"object"},"body":{"type":"object"}}}', '["automation.call"]', 'Call external webhook')
) AS v(action_type, config_schema, permissions_required, description)
WHERE NOT EXISTS (
    SELECT 1 FROM app.automation_action_catalog aac
    WHERE aac.action_type = v.action_type
);

PRINT 'Automation module tables created successfully';
