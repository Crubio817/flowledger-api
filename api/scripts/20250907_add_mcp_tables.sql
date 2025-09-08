-- Create tables for MCP server: enrichment_contacts, enrichment_jobs, emails

-- Enrichment contacts table (to avoid confusion with client_contacts)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='enrichment_contacts' AND xtype='U')
BEGIN
    CREATE TABLE app.enrichment_contacts (
        contact_id NVARCHAR(255) PRIMARY KEY,
        email NVARCHAR(255),
        first_name NVARCHAR(255),
        last_name NVARCHAR(255),
        company NVARCHAR(255),
        domain NVARCHAR(255),
        title NVARCHAR(255),
        linkedin NVARCHAR(512),
        phone_json NVARCHAR(MAX),
        source NVARCHAR(50),
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE()
    );
END

-- Enrichment jobs table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='enrichment_jobs' AND xtype='U')
BEGIN
    CREATE TABLE app.enrichment_jobs (
        job_id NVARCHAR(255) PRIMARY KEY,
        provider NVARCHAR(50),
        input_json NVARCHAR(MAX),
        status NVARCHAR(50),
        result_json NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE()
    );
END

-- Emails table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='emails' AND xtype='U')
BEGIN
    CREATE TABLE app.emails (
        message_id NVARCHAR(255) PRIMARY KEY,
        to_json NVARCHAR(MAX),
        subject NVARCHAR(255),
        body_hash NVARCHAR(255),
        provider NVARCHAR(50),
        sent_at DATETIME2 DEFAULT GETUTCDATE(),
        status NVARCHAR(50)
    );
END
