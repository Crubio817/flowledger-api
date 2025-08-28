-- Migration: add contact_social_profiles table
-- Run this against your database in a safe maintenance window.

IF NOT EXISTS (SELECT * FROM sys.schemas s WHERE s.name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app');
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.contact_social_profiles') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.contact_social_profiles (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        contact_id BIGINT NOT NULL,
        provider NVARCHAR(50) NOT NULL,
        profile_url NVARCHAR(512) NOT NULL,
        is_primary BIT NOT NULL DEFAULT 0,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2(3) NULL
    );

    ALTER TABLE app.contact_social_profiles
    ADD CONSTRAINT FK_contact_social_profiles_contact FOREIGN KEY (contact_id)
    REFERENCES app.client_contacts(contact_id);

    CREATE INDEX IX_contact_social_profiles_contact_id ON app.contact_social_profiles(contact_id);
    CREATE INDEX IX_contact_social_profiles_provider ON app.contact_social_profiles(provider);
END
