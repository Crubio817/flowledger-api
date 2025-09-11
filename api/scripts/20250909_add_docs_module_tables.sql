-- Docs & Knowledge Module Tables Migration
-- Adds core tables for documents, versions, approvals, templates, etc.
-- Follows FlowLedger patterns: multi-tenant (org_id), event-sourced, immutable versions.

-- Documents table (core entity)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='document' AND xtype='U')
CREATE TABLE app.document (
    id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    title NVARCHAR(255) NOT NULL,
    type NVARCHAR(50) NOT NULL CHECK (type IN ('proposal', 'sow', 'report', 'runbook', 'evidence', 'invoice_pdf', 'contract', 'note')),
    status NVARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'released', 'archived')),
    classification NVARCHAR(50) NOT NULL DEFAULT 'internal' CHECK (classification IN ('internal', 'client_view', 'confidential')),
    source NVARCHAR(50) NOT NULL CHECK (source IN ('file', 'generated', 'external_link')),
    storage_url NVARCHAR(500),
    storage_hash VARBINARY(32), -- SHA-256 hash
    mime_type NVARCHAR(100),
    size_bytes BIGINT,
    created_by_user_id INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    deleted_at DATETIME2, -- Soft delete
    legal_hold_flag BIT NOT NULL DEFAULT 0,
    retention_expires_at DATETIME2,
    INDEX idx_document_org_status (org_id, status),
    INDEX idx_document_org_type (org_id, type),
    INDEX idx_document_org_classification (org_id, classification),
    -- No foreign key for org_id
);
GO

-- Document versions (immutable snapshots)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='document_version' AND xtype='U')
CREATE TABLE app.document_version (
    id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT NOT NULL,
    org_id INT NOT NULL, -- Denormalized for partitioning
    vnum INT NOT NULL,
    author_id INT NOT NULL,
    change_note NVARCHAR(500),
    storage_ref NVARCHAR(500) NOT NULL, -- Blob URL or hash
    hash_sha256 VARBINARY(32) NOT NULL,
    hash_prefix NVARCHAR(12) NOT NULL, -- For quick lookups
    approved_by_user_id INT,
    approved_at DATETIME2,
    signature_ref NVARCHAR(500), -- e-sign reference
    size_bytes BIGINT,
    mime_type NVARCHAR(100),
    virus_scan_status NVARCHAR(50) DEFAULT 'pending' CHECK (virus_scan_status IN ('pending', 'clean', 'flagged', 'failed')),
    generated_from_template_id INT,
    generated_params NVARCHAR(MAX), -- JSON
    rendered_at DATETIME2,
    render_error NVARCHAR(MAX),
    INDEX idx_version_doc_vnum (document_id, vnum),
    INDEX idx_version_org_hash (org_id, hash_prefix),
    FOREIGN KEY (document_id) REFERENCES app.document(id),
        -- No foreign key for org_id
);
GO

-- Document links (where docs live in context)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='document_link' AND xtype='U')
CREATE TABLE app.document_link (
    id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT NOT NULL,
    org_id INT NOT NULL,
    entity_type NVARCHAR(50) NOT NULL CHECK (entity_type IN ('client', 'workstream', 'pursuit', 'engagement', 'feature', 'task', 'audit_step', 'invoice')),
    entity_id INT NOT NULL,
    role NVARCHAR(50) NOT NULL CHECK (role IN ('context', 'deliverable', 'evidence')),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_link_org_entity (org_id, entity_type, entity_id),
    INDEX idx_link_doc_role (document_id, role),
    FOREIGN KEY (document_id) REFERENCES app.document(id),
    -- No foreign key for org_id
    UNIQUE (document_id, entity_type, entity_id, role) -- Prevent duplicate links
);

-- Templates (for document generation)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='template' AND xtype='U')
CREATE TABLE app.template (
    id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    kind NVARCHAR(50) NOT NULL CHECK (kind IN ('proposal', 'report', 'email', 'section')),
    engine NVARCHAR(50) NOT NULL DEFAULT 'md' CHECK (engine IN ('md', 'html', 'docx')),
    variables_schema NVARCHAR(MAX), -- JSON schema
    partials NVARCHAR(MAX), -- JSON array of partial refs
    is_system BIT NOT NULL DEFAULT 0,
    latest_version_id INT,
    engine_version NVARCHAR(50),
    deprecated_at DATETIME2,
    usage_count INT DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_template_org_kind (org_id, kind),
    -- No foreign key for org_id
);
GO

-- Binders (deliverable packs)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='binder' AND xtype='U')
CREATE TABLE app.binder (
    id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    render_to NVARCHAR(50) NOT NULL DEFAULT 'pdf' CHECK (render_to IN ('pdf', 'zip')),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_binder_org (org_id),
    -- No foreign key for org_id
);
GO

-- Share links (for external sharing)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='share_link' AND xtype='U')
CREATE TABLE app.share_link (
    id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT,
    binder_id INT,
    org_id INT NOT NULL,
    token NVARCHAR(64) NOT NULL UNIQUE, -- Opaque random
    scope NVARCHAR(50) NOT NULL CHECK (scope IN ('client', 'external_email')),
    expires_at DATETIME2,
    watermark BIT NOT NULL DEFAULT 0,
    password_hash NVARCHAR(255),
    viewed_count INT DEFAULT 0,
    last_viewed_at DATETIME2,
    revoked_at DATETIME2,
    INDEX idx_share_org_token (org_id, token),
    FOREIGN KEY (document_id) REFERENCES app.document(id),
    FOREIGN KEY (binder_id) REFERENCES app.binder(id),
    -- No foreign key for org_id
    CHECK ((document_id IS NOT NULL AND binder_id IS NULL) OR (document_id IS NULL AND binder_id IS NOT NULL))
);
GO

-- Binder items (polymorphic refs)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='binder_item' AND xtype='U')
CREATE TABLE app.binder_item (
    id INT IDENTITY(1,1) PRIMARY KEY,
    binder_id INT NOT NULL,
    org_id INT NOT NULL,
    document_version_id INT,
    template_section_id INT,
    order_index INT NOT NULL,
    snapshot_title NVARCHAR(255),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_item_binder_order (binder_id, order_index),
    FOREIGN KEY (binder_id) REFERENCES app.binder(id),
    FOREIGN KEY (document_version_id) REFERENCES app.document_version(id),
    -- No foreign key for org_id
    CHECK ((document_version_id IS NOT NULL AND template_section_id IS NULL) OR (document_version_id IS NULL AND template_section_id IS NOT NULL))
);
GO

-- Knowledge articles (specialized docs)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='knowledge_article' AND xtype='U')
CREATE TABLE app.knowledge_article (
    id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    title NVARCHAR(255) NOT NULL,
    taxonomy NVARCHAR(MAX), -- JSON: {area, service, tech}
    body_md NVARCHAR(MAX) NOT NULL,
    attachments NVARCHAR(MAX), -- JSON array
    published BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_article_org_published (org_id, published),
    -- No foreign key for org_id
);
GO

-- Document audit trail
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='document_audit' AND xtype='U')
CREATE TABLE app.document_audit (
    id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    document_id INT,
    document_version_id INT,
    actor_user_id INT,
    action NVARCHAR(100) NOT NULL,
    meta NVARCHAR(MAX), -- JSON payload
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    INDEX idx_audit_org_doc (org_id, document_id),
    INDEX idx_audit_org_action (org_id, action),
    -- No foreign key for org_id
    FOREIGN KEY (document_id) REFERENCES app.document(id),
    FOREIGN KEY (document_version_id) REFERENCES app.document_version(id)
);
GO

-- Document search index (for full-text)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='document_search_index' AND xtype='U')
CREATE TABLE app.document_search_index (
    document_id INT PRIMARY KEY,
    org_id INT NOT NULL,
    version_id INT NOT NULL,
    extracted_text NVARCHAR(MAX),
    INDEX idx_search_org_text (org_id) INCLUDE (extracted_text), -- Full-text index on extracted_text
    FOREIGN KEY (document_id) REFERENCES app.document(id),
    FOREIGN KEY (version_id) REFERENCES app.document_version(id),
    -- No foreign key for org_id
);
GO

-- Enable full-text search on document_search_index.extracted_text
-- (Run separately: CREATE FULLTEXT CATALOG ft_catalog AS DEFAULT; CREATE FULLTEXT INDEX ON app.document_search_index(extracted_text) KEY INDEX PK_document_search_index;)
