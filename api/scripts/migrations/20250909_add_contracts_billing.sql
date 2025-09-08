-- Migration: 20250909_add_contracts_billing.sql
-- Adds Contracts and Billing tables for rate resolution and invoicing

-- Rate cards for precedence-based rate resolution
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rate_card' AND xtype='U')
BEGIN
    CREATE TABLE app.rate_card (
      rate_card_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      scope varchar(20) NOT NULL CHECK (scope IN ('org', 'client', 'engagement', 'role', 'person')),
      scope_id bigint, -- Nullable for org-level
      role_template_id bigint, -- Nullable for general rates
      level varchar(5), -- Nullable
      base_rate decimal(10,2) NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'USD',
      effective_from datetime2 NOT NULL,
      effective_to datetime2,
      tier varchar(20), -- e.g., 'standard', 'premium'
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (role_template_id) REFERENCES app.role_template(role_template_id)
    );
END
GO

-- Rate premiums
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rate_premium' AND xtype='U')
BEGIN
    CREATE TABLE app.rate_premium (
      rate_premium_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      skill_id bigint, -- Nullable for general premiums
      amount_abs decimal(10,2), -- Absolute amount
      amount_pct decimal(5,2), -- Percentage
      applies_to varchar(20) NOT NULL CHECK (applies_to IN ('role', 'person', 'engagement')),
      applies_to_id bigint NOT NULL,
      effective_from datetime2 NOT NULL,
      effective_to datetime2,
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES app.skill(skill_id),
      CONSTRAINT chk_amount_exclusive CHECK (
        (amount_abs IS NOT NULL AND amount_pct IS NULL) OR
        (amount_abs IS NULL AND amount_pct IS NOT NULL)
      )
    );
END
GO

-- Contracts/SOWs
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='contract' AND xtype='U')
BEGIN
    CREATE TABLE app.contract (
      contract_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      client_id int NOT NULL, -- Assuming client table exists
      engagement_id bigint NOT NULL,
      start_date date NOT NULL,
      end_date date,
      currency varchar(3) NOT NULL DEFAULT 'USD',
      billing_terms nvarchar(MAX), -- JSON terms
      status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'terminated')),
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL
    );
END
GO

-- Contract budget caps
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='contract_budget' AND xtype='U')
BEGIN
    CREATE TABLE app.contract_budget (
      contract_budget_id bigint IDENTITY(1,1) PRIMARY KEY,
      contract_id bigint NOT NULL,
      cap_amount decimal(12,2), -- Total cap
      cap_hours decimal(8,2), -- Hours cap
      alerts_enabled bit NOT NULL DEFAULT 1,
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (contract_id) REFERENCES app.contract(contract_id) ON DELETE CASCADE
    );
END
GO

-- Contract rate overrides
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='contract_rate_override' AND xtype='U')
BEGIN
    CREATE TABLE app.contract_rate_override (
      override_id bigint IDENTITY(1,1) PRIMARY KEY,
      contract_id bigint NOT NULL,
      scope varchar(20) NOT NULL CHECK (scope IN ('client', 'engagement', 'role', 'person')),
      scope_id bigint NOT NULL,
      role_template_id bigint,
      level varchar(5),
      override_rate decimal(10,2) NOT NULL,
      effective_from datetime2 NOT NULL,
      effective_to datetime2,
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (contract_id) REFERENCES app.contract(contract_id) ON DELETE CASCADE,
      FOREIGN KEY (role_template_id) REFERENCES app.role_template(role_template_id)
    );
END
GO

-- Time entries for invoicing
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='time_entry' AND xtype='U')
BEGIN
    CREATE TABLE app.time_entry (
      time_entry_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      assignment_id bigint NOT NULL,
      hours decimal(5,2) NOT NULL,
      entry_date date NOT NULL,
      description nvarchar(500),
      billable bit NOT NULL DEFAULT 1,
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (assignment_id) REFERENCES app.assignment(assignment_id) ON DELETE CASCADE
    );
END
GO

-- Draft invoices
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='invoice' AND xtype='U')
BEGIN
    CREATE TABLE app.invoice (
      invoice_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      engagement_id bigint NOT NULL,
      contract_id bigint,
      invoice_number varchar(50) UNIQUE NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      total_amount decimal(12,2) NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'USD',
      status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
      due_date date,
      notes nvarchar(1000),
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (contract_id) REFERENCES app.contract(contract_id)
    );
END
GO

-- Invoice line items
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='invoice_line' AND xtype='U')
BEGIN
    CREATE TABLE app.invoice_line (
      invoice_line_id bigint IDENTITY(1,1) PRIMARY KEY,
      invoice_id bigint NOT NULL,
      assignment_id bigint,
      description nvarchar(200) NOT NULL,
      quantity decimal(8,2) NOT NULL,
      unit_price decimal(10,2) NOT NULL,
      line_total decimal(12,2) NOT NULL,
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      FOREIGN KEY (invoice_id) REFERENCES app.invoice(invoice_id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES app.assignment(assignment_id)
    );
END
GO

-- Indices
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.rate_card') AND name = 'uq_rate_card_org_scope')
    CREATE UNIQUE INDEX uq_rate_card_org_scope ON app.rate_card(org_id, scope, scope_id, role_template_id, level, effective_from);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.rate_premium') AND name = 'ix_rate_premium_org_skill')
    CREATE INDEX ix_rate_premium_org_skill ON app.rate_premium(org_id, skill_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.contract') AND name = 'ix_contract_org_client')
    CREATE INDEX ix_contract_org_client ON app.contract(org_id, client_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.time_entry') AND name = 'ix_time_entry_assignment')
    CREATE INDEX ix_time_entry_assignment ON app.time_entry(assignment_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.invoice') AND name = 'ix_invoice_org_engagement')
    CREATE INDEX ix_invoice_org_engagement ON app.invoice(org_id, engagement_id);
