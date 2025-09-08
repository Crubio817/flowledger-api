/* Create core/modules schemas and tables for modular system with scope flag */
PRINT 'Starting core/modules schema migration';
GO

/* Schemas */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core')
BEGIN
  EXEC('CREATE SCHEMA core');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'modules')
BEGIN
  EXEC('CREATE SCHEMA modules');
END
GO

/* Organizations */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='core' AND t.name='organizations')
BEGIN
  CREATE TABLE core.organizations (
      org_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_core_organizations_org_id DEFAULT NEWID() PRIMARY KEY,
      name NVARCHAR(200) NOT NULL,
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_organizations_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

/* Clients (UUID) */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='core' AND t.name='clients')
BEGIN
  CREATE TABLE core.clients (
      client_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_core_clients_client_id DEFAULT NEWID() PRIMARY KEY,
      org_id UNIQUEIDENTIFIER NOT NULL,
      name NVARCHAR(200) NOT NULL,
      status VARCHAR(30) NOT NULL CONSTRAINT DF_core_clients_status DEFAULT 'active',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_clients_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_core_clients_org FOREIGN KEY (org_id) REFERENCES core.organizations(org_id)
  );
  CREATE INDEX IX_core_clients_org ON core.clients(org_id);
END
GO

/* Module registry */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module')
BEGIN
  CREATE TABLE modules.module (
      module_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_id DEFAULT NEWID() PRIMARY KEY,
      [key] VARCHAR(100) NOT NULL UNIQUE,
      name NVARCHAR(200) NOT NULL,
      description NVARCHAR(1000) NULL,
      scope VARCHAR(30) NOT NULL CONSTRAINT DF_modules_module_scope DEFAULT 'external',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_modules_module_scope CHECK (scope IN ('internal','external','hybrid'))
  );
END
GO

/* Module versions */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_version')
BEGIN
  CREATE TABLE modules.module_version (
      module_version_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_version_id DEFAULT NEWID() PRIMARY KEY,
      module_id UNIQUEIDENTIFIER NOT NULL,
      semver VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL CONSTRAINT DF_modules_module_version_status DEFAULT 'released',
      created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_version_created_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_modules_module_version UNIQUE(module_id, semver),
      CONSTRAINT CK_modules_module_version_status CHECK (status IN ('draft','released','deprecated')),
      CONSTRAINT FK_modules_module_version_module FOREIGN KEY (module_id) REFERENCES modules.module(module_id)
  );
  CREATE INDEX IX_modules_module_version_module ON modules.module_version(module_id);
END
GO

/* Module instances (client references app.clients INT id) */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_instance')
BEGIN
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
END
GO

/* Module config */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='modules' AND t.name='module_config')
BEGIN
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
END
GO

/* Optional: enforcement stub for internal-only modules (replace YOUR_ORG_ID to enable)
-- ALTER TABLE modules.module_instance ADD CONSTRAINT CK_internal_instance
-- CHECK (
--   NOT EXISTS (
--     SELECT 1 FROM modules.module m
--     WHERE m.module_id = module_instance.module_id
--       AND m.scope = 'internal'
--       AND module_instance.client_id NOT IN (
--         SELECT c.client_id FROM core.clients c WHERE c.org_id = 'YOUR_ORG_ID_HERE'
--       )
--   )
-- );
*/

PRINT 'Completed core/modules schema migration';
GO
