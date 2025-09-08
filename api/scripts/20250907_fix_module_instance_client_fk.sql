/* Adjust modules.module_instance.client_id to INT referencing app.clients if previously created as UNIQUEIDENTIFIER */
PRINT 'Checking modules.module_instance client_id type';
GO

DECLARE @needsFix BIT = 0;
IF EXISTS (
  SELECT 1 FROM sys.columns c
  JOIN sys.types t ON c.user_type_id = t.user_type_id
  JOIN sys.tables tb ON tb.object_id = c.object_id
  JOIN sys.schemas s ON s.schema_id = tb.schema_id
  WHERE s.name = 'modules' AND tb.name = 'module_instance' AND c.name = 'client_id' AND t.name = 'uniqueidentifier'
)
  SET @needsFix = 1;

IF (@needsFix = 1)
BEGIN
  DECLARE @miCount INT = 0, @mcCount INT = 0;
  SELECT @miCount = COUNT(*) FROM modules.module_instance;
  IF EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_config')
    SELECT @mcCount = COUNT(*) FROM modules.module_config;

  IF (@miCount = 0 AND @mcCount = 0)
  BEGIN
    PRINT 'Dropping empty module_config and module_instance to recreate with INT client_id...';
    IF OBJECT_ID('modules.module_config','U') IS NOT NULL DROP TABLE modules.module_config;
    IF OBJECT_ID('modules.module_instance','U') IS NOT NULL DROP TABLE modules.module_instance;

    -- Recreate module_instance
    CREATE TABLE modules.module_instance (
      module_instance_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_instance_id DEFAULT NEWID() PRIMARY KEY,
      module_id UNIQUEIDENTIFIER NOT NULL,
      module_version_id UNIQUEIDENTIFIER NULL,
      client_id INT NOT NULL,
      is_enabled BIT NOT NULL CONSTRAINT DF_modules_module_instance_is_enabled DEFAULT 1,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_instance_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_modules_module_instance_module FOREIGN KEY (module_id) REFERENCES modules.module(module_id),
      CONSTRAINT FK_modules_module_instance_version FOREIGN KEY (module_version_id) REFERENCES modules.module_version(module_version_id),
      CONSTRAINT FK_modules_module_instance_client FOREIGN KEY (client_id) REFERENCES app.clients(client_id)
    );
    CREATE INDEX IX_modules_module_instance_module ON modules.module_instance(module_id);
    CREATE INDEX IX_modules_module_instance_client ON modules.module_instance(client_id);

    -- Recreate module_config
    CREATE TABLE modules.module_config (
      module_config_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_config_id DEFAULT NEWID() PRIMARY KEY,
      module_instance_id UNIQUEIDENTIFIER NOT NULL,
      cfg_json NVARCHAR(MAX) NOT NULL,
      secrets_ref NVARCHAR(200) NULL,
      is_active BIT NOT NULL CONSTRAINT DF_modules_module_config_is_active DEFAULT 1,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_config_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_modules_module_config_instance FOREIGN KEY (module_instance_id) REFERENCES modules.module_instance(module_instance_id)
    );
    CREATE INDEX IX_modules_module_config_instance ON modules.module_config(module_instance_id);

    PRINT 'Recreated with INT client_id.';
  END
  ELSE
  BEGIN
    RAISERROR('Cannot auto-fix: module_instance/module_config contain data. Manual migration required to map UUID client references.', 16, 1);
  END
END
ELSE
  PRINT 'No fix needed.';
GO
