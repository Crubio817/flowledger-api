-- Billing & Contracts Module Database Migration
-- Run after core modules migration: npm run db:migrate:core-modules
-- Extends existing contracts-billing.sql with world-class features

-- Extend existing contract table with advanced billing types
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.contract') AND name = 'contract_type')
BEGIN
    ALTER TABLE app.contract ADD
        contract_type VARCHAR(20) NOT NULL DEFAULT 'T&M' CHECK (contract_type IN ('T&M', 'Fixed', 'Milestone', 'Retainer', 'Prepaid')),
        billing_terms NVARCHAR(MAX), -- JSON: {frequency, terms, conditions}
        tax_profile_id BIGINT,
        retainer_amount DECIMAL(12,2),
        retainer_period VARCHAR(20), -- 'monthly', 'quarterly', 'annual'
        included_hours DECIMAL(8,2),
        prepayment_balance DECIMAL(12,2) DEFAULT 0,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        exchange_rate DECIMAL(10,6) DEFAULT 1.0,
        budget_cap DECIMAL(12,2),
        budget_alert_pct DECIMAL(5,2) DEFAULT 80.0,
        auto_renewal BIT DEFAULT 0,
        renewal_notice_days INT DEFAULT 30;
END
GO

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
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, contract_id) REFERENCES app.contract(org_id, contract_id) ON DELETE CASCADE,
        FOREIGN KEY (org_id, milestone_id) REFERENCES app.milestone(org_id, milestone_id)
    );
END
GO

-- Extend time_entry with billing snapshots and approval workflow
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.time_entry') AND name = 'approved_at')
BEGIN
    ALTER TABLE app.time_entry ADD
        approved_at DATETIME2,
        approved_by BIGINT,
        bill_rate_snapshot DECIMAL(10,2),
        cost_rate_snapshot DECIMAL(10,2),
        currency_snapshot VARCHAR(3) DEFAULT 'USD',
        exchange_rate_snapshot DECIMAL(10,6) DEFAULT 1.0,
        notes NVARCHAR(500),
        invoice_line_id BIGINT,
        revenue_recognized_at DATETIME2;
END
GO

-- Extend invoice table with advanced features
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.invoice') AND name = 'invoice_type')
BEGIN
    ALTER TABLE app.invoice ADD
        invoice_type VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (invoice_type IN ('standard', 'credit_note', 'adjustment')),
        parent_invoice_id BIGINT, -- For credit notes
        tax_amount DECIMAL(12,2) DEFAULT 0,
        discount_amount DECIMAL(12,2) DEFAULT 0,
        net_amount AS (total_amount - discount_amount + tax_amount),
        paid_amount DECIMAL(12,2) DEFAULT 0,
        outstanding_amount AS (net_amount - paid_amount),
        sent_at DATETIME2,
        viewed_at DATETIME2,
        reminder_count INT DEFAULT 0,
        last_reminder_at DATETIME2,
        collection_status VARCHAR(20) DEFAULT 'current' CHECK (collection_status IN ('current', 'overdue', 'collections', 'written_off')),
        pdf_url NVARCHAR(512),
        external_ref NVARCHAR(100),
        payment_terms VARCHAR(100) DEFAULT 'Net 30',
        po_number NVARCHAR(50);
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
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id) ON DELETE CASCADE,
        FOREIGN KEY (org_id, time_entry_id) REFERENCES app.time_entry(org_id, time_entry_id),
        FOREIGN KEY (org_id, milestone_id) REFERENCES app.contract_milestone(org_id, contract_milestone_id),
        FOREIGN KEY (org_id, assignment_id) REFERENCES app.assignment(org_id, assignment_id)
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
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id)
    );
END
GO

-- Credit notes for adjustments
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='credit_note' AND xtype='U')
BEGIN
    CREATE TABLE app.credit_note (
        credit_note_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        invoice_id BIGINT NOT NULL,
        credit_note_number NVARCHAR(50) UNIQUE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'applied', 'expired')),
        issued_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        expires_at DATETIME2,
        applied_amount DECIMAL(12,2) DEFAULT 0,
        pdf_url NVARCHAR(512),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id)
    );
END
GO

-- Revenue recognition events
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='revenue_event' AND xtype='U')
BEGIN
    CREATE TABLE app.revenue_event (
        revenue_event_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        engagement_id BIGINT NOT NULL,
        contract_id BIGINT,
        invoice_id BIGINT,
        event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('time', 'milestone', 'pct_complete', 'retainer_release', 'adjustment')),
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        recognized_at DATETIME2 NOT NULL,
        period_start DATE,
        period_end DATE,
        description NVARCHAR(500),
        source_type VARCHAR(20), -- 'time_entry', 'milestone_completion', etc.
        source_id BIGINT,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id),
        FOREIGN KEY (org_id, contract_id) REFERENCES app.contract(org_id, contract_id),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id)
    );
END
GO

-- Work in progress snapshots
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='wip_snapshot' AND xtype='U')
BEGIN
    CREATE TABLE app.wip_snapshot (
        wip_snapshot_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        engagement_id BIGINT NOT NULL,
        snapshot_date DATE NOT NULL,
        unbilled_time_value DECIMAL(12,2) NOT NULL DEFAULT 0,
        unbilled_milestone_value DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_unbilled_value AS (unbilled_time_value + unbilled_milestone_value),
        aging_0_30 DECIMAL(12,2) DEFAULT 0,
        aging_31_60 DECIMAL(12,2) DEFAULT 0,
        aging_61_90 DECIMAL(12,2) DEFAULT 0,
        aging_90_plus DECIMAL(12,2) DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id),
        UNIQUE (org_id, engagement_id, snapshot_date)
    );
END
GO

-- Tax profiles and rates
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tax_profile' AND xtype='U')
BEGIN
    CREATE TABLE app.tax_profile (
        tax_profile_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        name NVARCHAR(100) NOT NULL,
        jurisdiction NVARCHAR(100) NOT NULL,
        tax_type VARCHAR(20) NOT NULL CHECK (tax_type IN ('sales', 'vat', 'gst', 'other')),
        rate DECIMAL(5,4) NOT NULL, -- 0.0825 for 8.25%
        is_compound BIT NOT NULL DEFAULT 0,
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UNIQUE (org_id, name)
    );
END
GO

-- Tax codes for line items
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tax_code' AND xtype='U')
BEGIN
    CREATE TABLE app.tax_code (
        tax_code_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name NVARCHAR(100) NOT NULL,
        tax_profile_id BIGINT NOT NULL,
        rate DECIMAL(5,4) NOT NULL,
        is_default BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, tax_profile_id) REFERENCES app.tax_profile(org_id, tax_profile_id),
        UNIQUE (org_id, code)
    );
END
GO

-- Currency exchange rates
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='currency_rate' AND xtype='U')
BEGIN
    CREATE TABLE app.currency_rate (
        currency_rate_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        from_currency VARCHAR(3) NOT NULL,
        to_currency VARCHAR(3) NOT NULL,
        rate DECIMAL(10,6) NOT NULL,
        effective_date DATE NOT NULL,
        source VARCHAR(50), -- 'manual', 'ecb', 'xe', etc.
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UNIQUE (org_id, from_currency, to_currency, effective_date)
    );
END
GO

-- Invoice reminders and collections
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='invoice_reminder' AND xtype='U')
BEGIN
    CREATE TABLE app.invoice_reminder (
        invoice_reminder_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        invoice_id BIGINT NOT NULL,
        reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('overdue_7', 'overdue_14', 'overdue_30', 'final_notice', 'collection')),
        sent_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        sent_by BIGINT,
        comms_thread_id BIGINT, -- Link to Comms module
        notes NVARCHAR(500),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id)
    );
END
GO

-- Write-offs for bad debt
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='write_off' AND xtype='U')
BEGIN
    CREATE TABLE app.write_off (
        write_off_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL,
        invoice_id BIGINT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        approved_by BIGINT NOT NULL,
        approved_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY (org_id, invoice_id) REFERENCES app.invoice(org_id, invoice_id)
    );
END
GO

-- Indexes for performance
CREATE INDEX IX_contract_milestone_org_contract ON app.contract_milestone(org_id, contract_id);
CREATE INDEX IX_contract_milestone_status_due ON app.contract_milestone(org_id, status, due_at);
CREATE INDEX IX_time_entry_approved_org ON app.time_entry(org_id, approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IX_invoice_org_status_due ON app.invoice(org_id, status, due_date);
CREATE INDEX IX_invoice_line_org_invoice ON app.invoice_line_item(org_id, invoice_id);
CREATE INDEX IX_payment_org_invoice ON app.payment(org_id, invoice_id);
CREATE INDEX IX_revenue_event_org_engagement ON app.revenue_event(org_id, engagement_id, recognized_at);
CREATE INDEX IX_wip_snapshot_org_engagement ON app.wip_snapshot(org_id, engagement_id, snapshot_date DESC);
CREATE INDEX IX_invoice_reminder_org_invoice ON app.invoice_reminder(org_id, invoice_id);

-- Sample data for testing
INSERT INTO app.contract (org_id, client_id, engagement_id, contract_type, currency, start_date, billing_terms)
SELECT 1, c.client_id, e.engagement_id, 'T&M', 'USD', '2025-09-08', '{"frequency": "monthly", "terms": "Net 30"}'
FROM app.client c
JOIN app.engagement e ON c.client_id = e.client_id AND c.org_id = e.org_id
WHERE c.org_id = 1 AND e.org_id = 1 AND e.contract_id IS NULL;

PRINT 'Billing & Contracts module database migration completed successfully';
