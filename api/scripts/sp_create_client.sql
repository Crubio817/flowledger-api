SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [app].[sp_create_client]
    @Name NVARCHAR(200),
    @IsActive BIT = 1,
    @PackCode VARCHAR(64) = NULL,
    @LogoUrl NVARCHAR(512) = NULL,

    -- Optional JSON payloads
    @ContactsJson NVARCHAR(MAX) = NULL,              
    @DocumentsJson NVARCHAR(MAX) = NULL,             
    @IndustriesJson NVARCHAR(MAX) = NULL,            
    @IntegrationsJson NVARCHAR(MAX) = NULL,          
    @LocationsJson NVARCHAR(MAX) = NULL,             
    @NotesJson NVARCHAR(MAX) = NULL,                 
    @EngagementTagsJson NVARCHAR(MAX) = NULL,        
    @ContactSocialProfilesJson NVARCHAR(MAX) = NULL  
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ClientId BIGINT;
    DECLARE @EngagementId BIGINT = NULL;
    DECLARE @Scope VARCHAR(20) = CASE WHEN @IsActive = 1 THEN 'active' ELSE 'prospect' END;
    DECLARE @PackId INT = NULL;

    -- Map temp keys -> generated contact_ids for social profiles
    DECLARE @ContactMap TABLE (
        temp_contact_key NVARCHAR(200) NULL,
        contact_id BIGINT NOT NULL
    );

    BEGIN TRY
        BEGIN TRAN;

        /* Create client */
        INSERT INTO app.clients (name, is_active, logo_url, created_utc)
        VALUES (@Name, @IsActive, @LogoUrl, SYSUTCDATETIME());
        SET @ClientId = SCOPE_IDENTITY();

        /* Optional engagement for active clients */
        IF @IsActive = 1
        BEGIN
            INSERT INTO app.client_engagements (client_id, name, status, start_utc, created_utc)
            VALUES (@ClientId, CONCAT(@Name, N' – Initial Engagement'), 'active', SYSUTCDATETIME(), SYSUTCDATETIME());
            SET @EngagementId = SCOPE_IDENTITY();
        END

        /* Resolve pack if provided */
        IF @PackCode IS NOT NULL
        BEGIN
            SELECT TOP (1) @PackId = p.pack_id
            FROM app.onboarding_task_pack p
            WHERE p.pack_code = @PackCode
              AND p.is_active = 1
              AND (p.status_scope IS NULL OR p.status_scope = 'any' OR p.status_scope = @Scope)
              AND (p.effective_to_utc IS NULL OR p.effective_to_utc > SYSUTCDATETIME())
              AND p.effective_from_utc <= SYSUTCDATETIME();

            IF @PackId IS NULL
            BEGIN
                RAISERROR('Invalid or incompatible @PackCode for the client status.', 16, 1);
                RETURN;
            END
        END

        /* Seed tasks (pack > defaults fallback) */
        IF @PackId IS NOT NULL
        BEGIN
            INSERT INTO app.client_onboarding_tasks (client_id, name, sort_order, due_utc, created_utc)
            SELECT
                @ClientId,
                t.name,
                t.sort_order,
                DATEADD(DAY, t.due_days, SYSUTCDATETIME()),
                SYSUTCDATETIME()
            FROM app.onboarding_task_pack_task t
            WHERE t.pack_id = @PackId
              AND t.is_active = 1
              AND (t.status_scope IS NULL OR t.status_scope = 'any' OR t.status_scope = @Scope)
              AND t.effective_from_utc <= SYSUTCDATETIME()
              AND (t.effective_to_utc IS NULL OR t.effective_to_utc > SYSUTCDATETIME())
            ORDER BY t.sort_order;
        END
        ELSE
        BEGIN
            INSERT INTO app.client_onboarding_tasks (client_id, name, sort_order, due_utc, created_utc)
            SELECT
                @ClientId,
                d.name,
                d.sort_order,
                DATEADD(DAY, d.due_days, SYSUTCDATETIME()),
                SYSUTCDATETIME()
            FROM app.onboarding_task_defaults d
            WHERE d.is_active = 1
              AND (d.status_scope = @Scope OR d.status_scope = 'any')
              AND d.effective_from_utc <= SYSUTCDATETIME()
              AND (d.effective_to_utc IS NULL OR d.effective_to_utc > SYSUTCDATETIME())
            ORDER BY d.sort_order;
        END

        /* ===== Optional child inserts start here ===== */

/* Contacts (capture temp key -> contact_id mapping) */
IF ISJSON(@ContactsJson) = 1
BEGIN
    ;WITH src AS (
        SELECT *
        FROM OPENJSON(@ContactsJson)
        WITH (
            first_name       NVARCHAR(200) '$.first_name',
            last_name        NVARCHAR(200) '$.last_name',
            email            NVARCHAR(320) '$.email',
            phone            NVARCHAR(50)  '$.phone',
            title            NVARCHAR(200) '$.title',
            is_primary       BIT           '$.is_primary',
            is_active        BIT           '$.is_active',
            temp_contact_key NVARCHAR(200) '$.temp_contact_key'
        )
    )
    MERGE app.client_contacts AS tgt
    USING src
      ON 1 = 0   -- force insert
    WHEN NOT MATCHED THEN
      INSERT (client_id, first_name, last_name, email, phone, title, is_primary, is_active, created_utc)
      VALUES (@ClientId, src.first_name, src.last_name, src.email, src.phone, src.title,
              ISNULL(src.is_primary, 0), ISNULL(src.is_active, 1), SYSUTCDATETIME())
    OUTPUT
      src.temp_contact_key,
      inserted.contact_id
    INTO @ContactMap (temp_contact_key, contact_id);
END

        /* Contact social profiles (joined via temp_contact_key) */
        IF ISJSON(@ContactSocialProfilesJson) = 1
        BEGIN
            WITH sp AS (
                SELECT *
                FROM OPENJSON(@ContactSocialProfilesJson)
                WITH (
                    temp_contact_key NVARCHAR(200) '$.temp_contact_key',
                    provider         NVARCHAR(100) '$.provider',
                    profile_url      NVARCHAR(400) '$.profile_url',
                    is_primary       BIT           '$.is_primary'
                )
            )
            INSERT INTO app.contact_social_profiles
                (contact_id, provider, profile_url, is_primary, created_utc, updated_utc)
            SELECT
                m.contact_id,
                sp.provider,
                sp.profile_url,
                ISNULL(sp.is_primary, 0),
                SYSUTCDATETIME(),
                NULL
            FROM sp
            INNER JOIN @ContactMap m
                ON ( (sp.temp_contact_key IS NULL AND m.temp_contact_key IS NULL)
                     OR sp.temp_contact_key = m.temp_contact_key );
        END

        /* Documents (defaults engagement_id to the created one if present) */
        IF ISJSON(@DocumentsJson) = 1
        BEGIN
            WITH d AS (
                SELECT *
                FROM OPENJSON(@DocumentsJson)
                WITH (
                    category          NVARCHAR(100) '$.category',
                    filename          NVARCHAR(260) '$.filename',
                    blob_url          NVARCHAR(1000) '$.blob_url',
                    uploaded_by_user  BIGINT        '$.uploaded_by_user',
                    uploaded_utc_str  NVARCHAR(50)  '$.uploaded_utc'
                )
            )
            INSERT INTO app.client_documents
                (client_id, engagement_id, category, filename, blob_url, uploaded_by_user, uploaded_utc)
            SELECT
                @ClientId,
                @EngagementId,
                d.category,
                d.filename,
                d.blob_url,
                d.uploaded_by_user,
                COALESCE(TRY_CONVERT(DATETIME2, d.uploaded_utc_str, 127), SYSUTCDATETIME())
            FROM d;
        END

        /* Industries */
        IF ISJSON(@IndustriesJson) = 1
        BEGIN
            WITH i AS (
                SELECT *
                FROM OPENJSON(@IndustriesJson)
                WITH (
                    industry_id BIGINT '$.industry_id',
                    is_primary  BIT    '$.is_primary'
                )
            )
            INSERT INTO app.client_industries
                (client_id, industry_id, is_primary, created_utc)
            SELECT
                @ClientId, i.industry_id, ISNULL(i.is_primary, 0), SYSUTCDATETIME()
            FROM i;
        END

        /* Integrations */
        IF ISJSON(@IntegrationsJson) = 1
        BEGIN
            WITH ig AS (
                SELECT *
                FROM OPENJSON(@IntegrationsJson)
                WITH (
                    provider            NVARCHAR(100) '$.provider',
                    status              NVARCHAR(50)  '$.status',
                    external_account_id NVARCHAR(200) '$.external_account_id',
                    secret_ref          NVARCHAR(200) '$.secret_ref'
                )
            )
            INSERT INTO app.client_integrations
                (client_id, provider, status, external_account_id, secret_ref, created_utc, updated_utc)
            SELECT
                @ClientId,
                ig.provider,
                ig.status,
                ig.external_account_id,
                ig.secret_ref,
                SYSUTCDATETIME(),
                NULL
            FROM ig;
        END

        /* Locations */
        IF ISJSON(@LocationsJson) = 1
        BEGIN
            WITH l AS (
                SELECT *
                FROM OPENJSON(@LocationsJson)
                WITH (
                    label          NVARCHAR(200) '$.label',
                    line1          NVARCHAR(200) '$.line1',
                    line2          NVARCHAR(200) '$.line2',
                    city           NVARCHAR(100) '$.city',
                    state_province NVARCHAR(100) '$.state_province',
                    postal_code    NVARCHAR(50)  '$.postal_code',
                    country        NVARCHAR(100) '$.country',
                    is_primary     BIT           '$.is_primary'
                )
            )
            INSERT INTO app.client_locations
                (client_id, label, line1, line2, city, state_province, postal_code, country, is_primary, created_utc)
            SELECT
                @ClientId,
                l.label, l.line1, l.line2, l.city, l.state_province, l.postal_code, l.country,
                ISNULL(l.is_primary, 0),
                SYSUTCDATETIME()
            FROM l;
        END

        /* Notes */
        IF ISJSON(@NotesJson) = 1
        BEGIN
            WITH n AS (
                SELECT *
                FROM OPENJSON(@NotesJson)
                WITH (
                    title        NVARCHAR(200) '$.title',
                    content      NVARCHAR(MAX) '$.content',
                    note_type    NVARCHAR(50)  '$.note_type',
                    is_important BIT           '$.is_important',
                    is_active    BIT           '$.is_active',
                    created_by   BIGINT        '$.created_by',
                    updated_by   BIGINT        '$.updated_by'
                )
            )
            INSERT INTO app.client_notes
                (client_id, title, content, note_type, is_important, is_active, created_utc, updated_utc, created_by, updated_by)
            SELECT
                @ClientId,
                n.title,
                n.content,
                n.note_type,
                ISNULL(n.is_important, 0),
                ISNULL(n.is_active, 1),
                SYSUTCDATETIME(),
                NULL,
                n.created_by,
                n.updated_by
            FROM n;
        END

        /* Engagement tags (requires engagement) */
        IF ISJSON(@EngagementTagsJson) = 1 AND @EngagementId IS NOT NULL
        BEGIN
            WITH t AS (
                SELECT *
                FROM OPENJSON(@EngagementTagsJson)
                WITH ( tag_id BIGINT '$.tag_id' )
            )
            INSERT INTO app.client_tag_map (engagement_id, tag_id)
            SELECT @EngagementId, t.tag_id
            FROM t;
        END

        /* Activity log */
        INSERT INTO app.client_activity (client_id, actor_user_id, verb, summary, created_utc)
        VALUES (@ClientId, NULL, 'created',
            CASE WHEN @IsActive = 1 THEN 'Client created (active)' ELSE 'Client created (prospect)' END,
            SYSUTCDATETIME());

        COMMIT;

        SELECT
            @ClientId     AS new_client_id,
            @EngagementId AS new_engagement_id,
            @PackId       AS used_pack_id;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 AND @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
