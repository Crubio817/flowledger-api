/*
  Migration: move client_tag_map from (client_id, tag_id) -> (engagement_id, tag_id)

  Safe procedure (run on a test/staging DB first):
  1) Ensure you have a backup: SELECT * INTO app.client_tag_map_backup FROM app.client_tag_map;
  2) Run the UP section below to add engagement_id, backfill, create indexes/FKs, and remove client_id constraints/column.
  3) Verify application behavior and data integrity.
  4) Optionally run the DOWN section to revert (if required).

  Notes:
  - This script uses dynamic IF EXISTS checks to avoid hard failures if objects have different names.
  - Replace or remove the backfill logic if you want a different business rule for mapping client->engagement.
  - Test in a copy of production before running in production.
*/

-- ==============================================
-- UP migration
-- ==============================================
PRINT '*** UP: Add engagement_id column (if missing)';
IF COL_LENGTH('app.client_tag_map', 'engagement_id') IS NULL
BEGIN
  ALTER TABLE app.client_tag_map ADD engagement_id INT NULL;
  PRINT 'Added engagement_id column';
END
ELSE
  PRINT 'engagement_id column already exists, skipping add';

-- Backfill engagement_id using most recent engagement per client
PRINT '*** UP: Backfilling engagement_id from latest engagement per client (by start_utc/created_utc)';
;WITH latest AS (
  SELECT engagement_id, client_id,
         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY COALESCE(start_utc, created_utc) DESC) rn
  FROM app.client_engagements
)
UPDATE m
SET engagement_id = l.engagement_id
FROM app.client_tag_map m
JOIN latest l ON l.client_id = m.client_id AND l.rn = 1
WHERE m.engagement_id IS NULL;

PRINT 'Backfill complete. Rows still missing engagement_id:';
SELECT COUNT(*) AS missing_engagement_id FROM app.client_tag_map WHERE engagement_id IS NULL;

-- Create index for engagement_id lookups (if not exists)
PRINT '*** UP: Creating index IX_client_tag_map_engagement if not exists';
IF NOT EXISTS(SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('app.client_tag_map') AND name = 'IX_client_tag_map_engagement')
BEGIN
  CREATE INDEX IX_client_tag_map_engagement ON app.client_tag_map (engagement_id);
  PRINT 'Created IX_client_tag_map_engagement';
END
ELSE
  PRINT 'Index IX_client_tag_map_engagement already exists';

-- Add FK to engagements (only if engagements PK exists and you want referential integrity)
PRINT '*** UP: Creating FK_client_tag_map_engagement if not exists';
IF NOT EXISTS(SELECT * FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('app.client_tag_map') AND name = 'FK_client_tag_map_engagement')
BEGIN
  IF OBJECT_ID('app.client_engagements') IS NOT NULL
  BEGIN
    ALTER TABLE app.client_tag_map
    ADD CONSTRAINT FK_client_tag_map_engagement FOREIGN KEY (engagement_id) REFERENCES app.client_engagements (engagement_id);
    PRINT 'Created FK_client_tag_map_engagement';
  END
  ELSE
    PRINT 'Skipping FK creation: app.client_engagements does not exist';
END
ELSE
  PRINT 'FK_client_tag_map_engagement already exists';

-- If there is an existing primary key or unique constraint on client_id+tag_id, drop it so we can create one on engagement_id+tag_id
PRINT '*** UP: Dropping PK / index / FK dependencies on client_id (if present)';

-- Drop foreign keys referencing client_id on this table
DECLARE @fkname NVARCHAR(255);
DECLARE fk_cursor CURSOR FOR
SELECT fk.name FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
WHERE OBJECT_NAME(c.object_id) = 'client_tag_map' AND c.name = 'client_id';
OPEN fk_cursor;
FETCH NEXT FROM fk_cursor INTO @fkname;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC('ALTER TABLE app.client_tag_map DROP CONSTRAINT [' + @fkname + ']');
  PRINT 'Dropped FK: ' + @fkname;
  FETCH NEXT FROM fk_cursor INTO @fkname;
END
CLOSE fk_cursor;
DEALLOCATE fk_cursor;

-- Drop indexes that include client_id (nonPK)
DECLARE @idxname NVARCHAR(255);
DECLARE idx_cursor CURSOR FOR
SELECT DISTINCT i.name FROM sys.indexes i
JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE OBJECT_NAME(i.object_id) = 'client_tag_map' AND c.name = 'client_id' AND i.is_primary_key = 0;
OPEN idx_cursor;
FETCH NEXT FROM idx_cursor INTO @idxname;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC('DROP INDEX [' + @idxname + '] ON app.client_tag_map');
  PRINT 'Dropped index: ' + @idxname;
  FETCH NEXT FROM idx_cursor INTO @idxname;
END
CLOSE idx_cursor;
DEALLOCATE idx_cursor;

-- Drop primary key if it directly uses client_id
DECLARE @pkname NVARCHAR(255);
SELECT @pkname = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE kc.parent_object_id = OBJECT_ID('app.client_tag_map') AND kc.type = 'PK' AND c.name = 'client_id';
IF @pkname IS NOT NULL
BEGIN
  EXEC('ALTER TABLE app.client_tag_map DROP CONSTRAINT [' + @pkname + ']');
  PRINT 'Dropped PK: ' + @pkname;
END
ELSE
  PRINT 'No PK directly on client_id found (or PK uses other columns)';

-- Create new PK / unique index on (engagement_id, tag_id) if desired
PRINT '*** UP: Creating primary key on (engagement_id, tag_id) if not exists and no NULLs remain';
IF (SELECT COUNT(*) FROM app.client_tag_map WHERE engagement_id IS NULL) = 0
BEGIN
  IF NOT EXISTS (SELECT * FROM sys.key_constraints kc WHERE kc.parent_object_id = OBJECT_ID('app.client_tag_map') AND kc.type = 'PK')
  BEGIN
    ALTER TABLE app.client_tag_map ADD CONSTRAINT PK_client_tag_map_engagement PRIMARY KEY CLUSTERED (engagement_id, tag_id);
    PRINT 'Created PK_client_tag_map_engagement';
  END
  ELSE
    PRINT 'Table already has a PK; please review before creating a new one';
END
ELSE
  PRINT 'Not all engagement_id values are populated; skip PK creation';

-- Finally, drop client_id column if you are ready (only run this after verifying backups and app behavior)
PRINT '*** UP: Dropping client_id column (commented out). Uncomment to enable drop when ready.';
--ALTER TABLE app.client_tag_map DROP COLUMN client_id;

-- ==============================================
-- DOWN migration (revert)
-- ==============================================
PRINT '*** DOWN: Reverting changes (this section is informational). Run steps manually if you need to rollback.';
-- Example steps to revert:
-- 1) Add client_id back (if you dropped it):
-- ALTER TABLE app.client_tag_map ADD client_id INT NULL;
-- 2) Backfill client_id from engagements:
-- UPDATE m SET client_id = e.client_id FROM app.client_tag_map m JOIN app.client_engagements e ON e.engagement_id = m.engagement_id;
-- 3) Recreate old PK/indexes/FKs as needed.

PRINT 'Migration script complete. Review outputs and run drop client_id when you are sure.';
