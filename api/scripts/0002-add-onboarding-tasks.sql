-- 0002-add-onboarding-tasks.sql
-- Create client_onboarding_tasks table if not exists
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE t.name='client_onboarding_tasks' AND s.name='app')
BEGIN
    CREATE TABLE app.client_onboarding_tasks (
        task_id INT IDENTITY(1,1) PRIMARY KEY,
        client_id INT NOT NULL,
        title NVARCHAR(200) NOT NULL,
        status NVARCHAR(40) NOT NULL DEFAULT 'todo',
        due_date DATETIME2 NULL,
        created_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2 NULL,
        CONSTRAINT FK_client_onboarding_tasks_clients FOREIGN KEY (client_id) REFERENCES app.clients(client_id)
    );
    PRINT 'Created table app.client_onboarding_tasks';
END
ELSE
BEGIN
    PRINT 'Table app.client_onboarding_tasks already exists; no action taken';
END

-- Optional: Add an index for client_id to help lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.tables t ON i.object_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE i.name='IX_client_onboarding_tasks_client_id' AND t.name='client_onboarding_tasks' AND s.name='app')
BEGIN
    CREATE INDEX IX_client_onboarding_tasks_client_id ON app.client_onboarding_tasks (client_id);
    PRINT 'Created index IX_client_onboarding_tasks_client_id';
END
ELSE
BEGIN
    PRINT 'Index IX_client_onboarding_tasks_client_id already exists; no action taken';
END
