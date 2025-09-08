-- Automation Module Migration
-- Date: 2025-09-08
-- Adds automation tables and enhances work_event for outbox pattern

-- 1) Enhance work_event table for proper outbox pattern
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'work_event_id')
BEGIN
    ALTER TABLE app.work_event ADD work_event_id BIGINT IDENTITY(1,1);
    -- Migrate existing data
    UPDATE app.work_event SET work_event_id = event_id WHERE work_event_id IS NULL;
    -- Make it the primary key
    ALTER TABLE app.work_event DROP CONSTRAINT PK__work_event__3213E83F;
    ALTER TABLE app.work_event ADD CONSTRAINT PK_work_event PRIMARY KEY (work_event_id);
END

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
INSERT INTO app.automation_action_catalog (action_type, config_schema, permissions_required, description) VALUES
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
('automation.call_webhook', '{"type":"object","properties":{"url":{"type":"string"},"method":{"type":"string"},"headers":{"type":"object"},"body":{"type":"object"}}}', '["automation.call"]', 'Call external webhook');

PRINT 'Automation module tables created successfully';
