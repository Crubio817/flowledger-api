-- Enhanced Identity and Deduplication System
-- Date: 2025-09-09
-- Implements canonical keys and contact resolution to prevent ghost duplicates

-- Canonical identity keys table
CREATE TABLE app.canonical_identity_keys (
  key_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  key_type VARCHAR(16) NOT NULL, -- 'email', 'phone', 'source_ref', 'company_domain'
  key_value VARCHAR(256) NOT NULL, -- Normalized key value
  canonical_contact_id INT NULL, -- Resolved to this contact
  canonical_client_id INT NULL, -- Resolved to this client
  confidence_score DECIMAL(3,2) NOT NULL DEFAULT 1.0, -- 0.0 to 1.0
  first_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  occurrences INT NOT NULL DEFAULT 1,
  resolution_status VARCHAR(16) NOT NULL DEFAULT 'unresolved', -- 'unresolved', 'auto_resolved', 'manual_resolved', 'conflict'
  resolved_by INT NULL, -- user_id for manual resolution
  resolved_at DATETIME2 NULL
);

-- Indexes for efficient lookups
CREATE UNIQUE INDEX UX_canonical_keys ON app.canonical_identity_keys(org_id, key_type, key_value);
CREATE INDEX IX_canonical_keys_contact ON app.canonical_identity_keys(org_id, canonical_contact_id) WHERE canonical_contact_id IS NOT NULL;
CREATE INDEX IX_canonical_keys_client ON app.canonical_identity_keys(org_id, canonical_client_id) WHERE canonical_client_id IS NOT NULL;
CREATE INDEX IX_canonical_keys_unresolved ON app.canonical_identity_keys(org_id, resolution_status) WHERE resolution_status = 'unresolved';

-- Enhanced signal deduplication with multiple key types
ALTER TABLE app.signal ADD 
  contact_email VARCHAR(256) NULL,
  contact_phone VARCHAR(32) NULL,
  company_domain VARCHAR(128) NULL,
  normalized_keys_json NVARCHAR(500) NULL; -- JSON object with all extracted keys

-- Composite dedupe constraint (replaces single dedupe_key)
CREATE UNIQUE INDEX UX_signal_composite_dedupe 
ON app.signal(org_id, source_type, source_ref, contact_email, contact_phone) 
WHERE contact_email IS NOT NULL OR contact_phone IS NOT NULL;

-- Identity resolution conflicts table
CREATE TABLE app.identity_resolution_conflicts (
  conflict_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  key_type VARCHAR(16) NOT NULL,
  key_value VARCHAR(256) NOT NULL,
  conflicting_contact_ids NVARCHAR(100) NOT NULL, -- JSON array of contact IDs
  conflicting_client_ids NVARCHAR(100) NULL, -- JSON array of client IDs
  conflict_reason NVARCHAR(300) NOT NULL,
  detected_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  resolution_status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
  resolved_contact_id INT NULL,
  resolved_client_id INT NULL,
  resolved_by INT NULL, -- user_id
  resolved_at DATETIME2 NULL,
  resolution_notes NVARCHAR(500) NULL
);

CREATE INDEX IX_identity_conflicts_status ON app.identity_resolution_conflicts(org_id, resolution_status);
CREATE INDEX IX_identity_conflicts_key ON app.identity_resolution_conflicts(org_id, key_type, key_value);

-- Contact merge audit trail
CREATE TABLE app.contact_merge_history (
  merge_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  primary_contact_id INT NOT NULL, -- Contact that was kept
  merged_contact_id INT NOT NULL, -- Contact that was merged/deleted
  merge_reason NVARCHAR(300) NOT NULL,
  merged_keys NVARCHAR(MAX) NULL, -- JSON object with keys that triggered merge
  data_preserved NVARCHAR(MAX) NULL, -- JSON object with data from merged contact
  merged_by INT NOT NULL, -- user_id
  merged_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_contact_merge_primary ON app.contact_merge_history(org_id, primary_contact_id);
CREATE INDEX IX_contact_merge_merged ON app.contact_merge_history(org_id, merged_contact_id);

-- View for identity resolution dashboard
CREATE VIEW app.v_identity_resolution_status AS
SELECT 
  cik.org_id,
  cik.key_type,
  COUNT(*) as total_keys,
  COUNT(CASE WHEN cik.resolution_status = 'unresolved' THEN 1 END) as unresolved_count,
  COUNT(CASE WHEN cik.resolution_status = 'auto_resolved' THEN 1 END) as auto_resolved_count,
  COUNT(CASE WHEN cik.resolution_status = 'manual_resolved' THEN 1 END) as manual_resolved_count,
  COUNT(CASE WHEN cik.resolution_status = 'conflict' THEN 1 END) as conflict_count,
  AVG(cik.confidence_score) as avg_confidence,
  MAX(cik.last_seen_at) as most_recent_activity
FROM app.canonical_identity_keys cik
GROUP BY cik.org_id, cik.key_type;

-- Stored procedure for identity resolution
CREATE PROCEDURE app.sp_resolve_identity
  @org_id INT,
  @key_type VARCHAR(16),
  @key_value VARCHAR(256),
  @resolved_contact_id INT = NULL,
  @resolved_client_id INT = NULL,
  @resolved_by INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  
  DECLARE @existing_key_id BIGINT;
  DECLARE @conflict_exists BIT = 0;
  
  -- Check if key exists
  SELECT @existing_key_id = key_id 
  FROM app.canonical_identity_keys 
  WHERE org_id = @org_id AND key_type = @key_type AND key_value = @key_value;
  
  -- Check for conflicts if resolving to different entities
  IF @existing_key_id IS NOT NULL
  BEGIN
    SELECT @conflict_exists = 1
    FROM app.canonical_identity_keys
    WHERE key_id = @existing_key_id
      AND (
        (@resolved_contact_id IS NOT NULL AND canonical_contact_id IS NOT NULL AND canonical_contact_id != @resolved_contact_id)
        OR (@resolved_client_id IS NOT NULL AND canonical_client_id IS NOT NULL AND canonical_client_id != @resolved_client_id)
      );
  END
  
  IF @conflict_exists = 1
  BEGIN
    -- Log conflict
    INSERT INTO app.identity_resolution_conflicts 
    (org_id, key_type, key_value, conflicting_contact_ids, conflicting_client_ids, conflict_reason)
    SELECT 
      @org_id, 
      @key_type, 
      @key_value,
      CONCAT('[', canonical_contact_id, ',', ISNULL(@resolved_contact_id, 'null'), ']'),
      CONCAT('[', ISNULL(canonical_client_id, 'null'), ',', ISNULL(@resolved_client_id, 'null'), ']'),
      'Attempted resolution conflicts with existing mapping'
    FROM app.canonical_identity_keys WHERE key_id = @existing_key_id;
    
    RETURN; -- Don't resolve, manual intervention needed
  END
  
  -- Update or insert resolution
  IF @existing_key_id IS NOT NULL
  BEGIN
    UPDATE app.canonical_identity_keys 
    SET 
      canonical_contact_id = @resolved_contact_id,
      canonical_client_id = @resolved_client_id,
      resolution_status = CASE WHEN @resolved_by IS NULL THEN 'auto_resolved' ELSE 'manual_resolved' END,
      resolved_by = @resolved_by,
      resolved_at = SYSUTCDATETIME(),
      last_seen_at = SYSUTCDATETIME(),
      occurrences = occurrences + 1
    WHERE key_id = @existing_key_id;
  END
  ELSE
  BEGIN
    INSERT INTO app.canonical_identity_keys 
    (org_id, key_type, key_value, canonical_contact_id, canonical_client_id, resolution_status, resolved_by, resolved_at)
    VALUES 
    (@org_id, @key_type, @key_value, @resolved_contact_id, @resolved_client_id, 
     CASE WHEN @resolved_by IS NULL THEN 'auto_resolved' ELSE 'manual_resolved' END, @resolved_by, SYSUTCDATETIME());
  END
END;

GO
