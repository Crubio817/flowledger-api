-- Migration: add task_packs and pack_tasks tables
-- Run this against your database in a safe maintenance window.

IF NOT EXISTS (SELECT * FROM sys.schemas s WHERE s.name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app');
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.task_packs') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.task_packs (
        pack_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        pack_code NVARCHAR(50) NOT NULL UNIQUE,
        pack_name NVARCHAR(200) NOT NULL,
        description NVARCHAR(1000) NULL,
        status_scope NVARCHAR(20) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        effective_from_utc DATETIME2(3) NULL,
        effective_to_utc DATETIME2(3) NULL,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2(3) NULL
    );

    CREATE INDEX IX_task_packs_pack_code ON app.task_packs(pack_code);
    CREATE INDEX IX_task_packs_status_scope ON app.task_packs(status_scope);
    CREATE INDEX IX_task_packs_is_active ON app.task_packs(is_active);
END

IF NOT EXISTS (SELECT * FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'app.pack_tasks') AND o.type IN (N'U'))
BEGIN
    CREATE TABLE app.pack_tasks (
        pack_task_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        pack_id BIGINT NOT NULL,
        name NVARCHAR(200) NOT NULL,
        sort_order INT NULL,
        due_days INT NULL,
        status_scope NVARCHAR(20) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_utc DATETIME2(3) NULL
    );

    ALTER TABLE app.pack_tasks
    ADD CONSTRAINT FK_pack_tasks_pack FOREIGN KEY (pack_id)
    REFERENCES app.task_packs(pack_id);

    CREATE INDEX IX_pack_tasks_pack_id ON app.pack_tasks(pack_id);
    CREATE INDEX IX_pack_tasks_is_active ON app.pack_tasks(is_active);
END
