-- Migration: add client_notes table
-- Run this against your database in a safe maintenance window.

IF NOT EXISTS (SELECT * FROM sys.schemas s WHERE s.name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app');
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.client_notes') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.client_notes (
        note_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        client_id BIGINT NOT NULL,
        title NVARCHAR(200) NOT NULL,
        content NVARCHAR(MAX) NULL,
        note_type NVARCHAR(50) NULL, -- e.g., 'general', 'meeting', 'follow-up', 'issue', etc.
        is_important BIT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2(3) NULL,
        created_by NVARCHAR(100) NULL, -- user who created the note
        updated_by NVARCHAR(100) NULL  -- user who last updated the note
    );

    ALTER TABLE app.client_notes
    ADD CONSTRAINT FK_client_notes_client FOREIGN KEY (client_id)
    REFERENCES app.clients(client_id);

    CREATE INDEX IX_client_notes_client_id ON app.client_notes(client_id);
    CREATE INDEX IX_client_notes_created_utc ON app.client_notes(created_utc DESC);
    CREATE INDEX IX_client_notes_is_important ON app.client_notes(is_important);
    CREATE INDEX IX_client_notes_is_active ON app.client_notes(is_active);
    CREATE INDEX IX_client_notes_note_type ON app.client_notes(note_type);
END
