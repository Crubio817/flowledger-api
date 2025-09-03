-- Migration: add industries and client_industries tables
-- Run this against your database in a safe maintenance window.

IF NOT EXISTS (SELECT * FROM sys.schemas s WHERE s.name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app');
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.industries') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.industries (
        industry_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL UNIQUE,
        description NVARCHAR(1000) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2(3) NULL
    );

    CREATE INDEX IX_industries_name ON app.industries(name);
    CREATE INDEX IX_industries_is_active ON app.industries(is_active);
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.client_industries') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.client_industries (
        client_id BIGINT NOT NULL,
        industry_id BIGINT NOT NULL,
        is_primary BIT NOT NULL DEFAULT 0,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        PRIMARY KEY (client_id, industry_id)
    );

    ALTER TABLE app.client_industries
    ADD CONSTRAINT FK_client_industries_client FOREIGN KEY (client_id)
    REFERENCES app.clients(client_id);

    ALTER TABLE app.client_industries
    ADD CONSTRAINT FK_client_industries_industry FOREIGN KEY (industry_id)
    REFERENCES app.industries(industry_id);

    CREATE INDEX IX_client_industries_client_id ON app.client_industries(client_id);
    CREATE INDEX IX_client_industries_industry_id ON app.client_industries(industry_id);
    CREATE INDEX IX_client_industries_is_primary ON app.client_industries(is_primary);
END
