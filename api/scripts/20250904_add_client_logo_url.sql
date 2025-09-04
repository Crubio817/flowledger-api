-- Add logo_url column to clients table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.clients') AND name = 'logo_url')
BEGIN
    ALTER TABLE app.clients ADD logo_url NVARCHAR(512) NULL;
END
