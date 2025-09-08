import fs from 'fs';
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';
import { Express } from 'express';
import { serve as swaggerServe, setup as swaggerSetup } from 'swagger-ui-express';

// Build a robust set of file globs so swagger-jsdoc can find
// route annotations both in TS (dev) and JS (built) outputs.
const apiGlobs: string[] = [
  // Source files (dev via ts-node / ts-node-dev)
  path.resolve(process.cwd(), 'api', 'src', '**', '*.ts'),
  // Built files (prod after tsc)
  path.resolve(process.cwd(), 'api', 'dist', '**', '*.js')
];

// Try to read version from package.json; fall back to hardcoded.
function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'api', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

const options: Options = {
  apis: apiGlobs,
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'FlowLedger API',
      version: readPackageVersion(),
      description: 'API for managing clients, audits, industries, and related business processes'
    },
    servers: [
      { url: '/', description: 'Relative to current host' },
      { url: 'http://localhost:4001', description: 'Local dev server' }
    ],
    // Initial tags (will be normalized and merged with discovered tags later)
    tags: [
      { name: 'Clients', description: 'Client management operations' },
      { name: 'ClientContacts', description: 'Client contact management' },
      { name: 'ClientDocuments', description: 'Client document storage and metadata' },
      { name: 'ClientEngagements', description: 'Engagements per client' },
      { name: 'ClientIntegrations', description: 'External integrations per client' },
      { name: 'ClientLocations', description: 'Client location management' },
      { name: 'ClientNotes', description: 'Client note management' },
      { name: 'ClientOnboardingTasks', description: 'Onboarding task operations' },
      { name: 'ClientTagMap', description: 'Mapping between clients and tags' },
      { name: 'ClientTags', description: 'Client tag management' },
      { name: 'ContactSocialProfiles', description: 'Social media profile management for contacts' },
      { name: 'Industries', description: 'Industry management and client-industry relationships' },
      { name: 'TaskPacks', description: 'Task pack and task management' },
      { name: 'Audits', description: 'Audit management operations' },
      { name: 'SIPOC', description: 'SIPOC documents' },
      { name: 'Interviews', description: 'Interview scheduling and retrieval' },
      { name: 'Interview Responses', description: 'Interview question/answer responses' },
      { name: 'Findings', description: 'Audit findings' },
      { name: 'Process Maps', description: 'Process map files and references' },
      { name: 'PathTemplates', description: 'Reusable audit path templates' },
      { name: 'PathSteps', description: 'Steps within an audit path' },
      { name: 'Audit Step Progress', description: 'Per-step audit progress tracking' },
      { name: 'Views', description: 'Read-only dashboard/overview views' },
      { name: 'AI', description: 'AI-powered features and tools' },
      { name: 'Auto', description: 'Auto-generated/experimental endpoints' },
      { name: 'Webhooks', description: 'Inbound webhook handlers' },
      { name: 'Misc', description: 'Uncategorized endpoints (auto-grouped)' }
    ],
    // Consumed by ReDoc for left-nav grouping
    'x-tagGroups': [
      { name: 'Clients', tags: ['Clients', 'ClientContacts', 'ClientDocuments', 'ClientNotes', 'ClientIntegrations', 'ClientLocations', 'ClientOnboardingTasks', 'ClientTagMap', 'ClientTags', 'ContactSocialProfiles'] },
      { name: 'Audits', tags: ['Audits', 'SIPOC', 'Interviews', 'Interview Responses', 'Findings', 'Process Maps', 'PathTemplates', 'PathSteps', 'Audit Step Progress'] },
      { name: 'Tasks', tags: ['TaskPacks'] },
      { name: 'Views', tags: ['Views'] },
      { name: 'AI', tags: ['AI'] },
      { name: 'Integrations', tags: ['Webhooks'] },
      { name: 'Misc', tags: ['Auto', 'Misc'] }
    ],
    components: {
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              },
              required: ['code', 'message']
            }
          },
          required: ['error']
        },
        PageMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1 },
            total: { type: 'integer', minimum: 0 }
          },
          required: ['page', 'limit']
        },
        DashboardStats: {
          type: 'object',
          properties: {
            active_clients: { type: 'integer' },
            audits_in_progress: { type: 'integer' },
            sipocs_completed: { type: 'integer' },
            pending_interviews: { type: 'integer' }
          },
          additionalProperties: false
        },
        RecentAudit: {
          type: 'object',
          properties: {
            audit_id: { type: 'integer' },
            client_id: { type: 'integer' },
            title: { type: 'string' },
            status: { type: 'string' },
            last_touched_utc: { type: 'string', format: 'date-time' }
          },
          required: ['audit_id', 'client_id', 'title', 'status', 'last_touched_utc']
        },
        Audit: {
          type: 'object',
          properties: {
            audit_id: { type: 'integer' },
            client_id: { type: 'integer' },
            title: { type: 'string' },
            scope: { type: 'string', nullable: true },
            status: { type: 'string' },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time' }
          },
          required: ['audit_id', 'client_id', 'title']
        },
        SipocDoc: {
          type: 'object',
          properties: {
            suppliers_json: { type: 'array', items: { type: 'string' } },
            inputs_json: { type: 'array', items: { type: 'string' } },
            process_json: { type: 'array', items: { type: 'string' } },
            outputs_json: { type: 'array', items: { type: 'string' } },
            customers_json: { type: 'array', items: { type: 'string' } },
            metrics_json: { type: 'object', additionalProperties: true }
          }
        },
        Interview: {
          type: 'object',
          properties: {
            interview_id: { type: 'integer' },
            audit_id: { type: 'integer' },
            persona: { type: 'string' },
            mode: { type: 'string' },
            scheduled_utc: { type: 'string', nullable: true, format: 'date-time' },
            status: { type: 'string' },
            notes: { type: 'string', nullable: true },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time' }
          },
          required: ['interview_id', 'audit_id', 'persona']
        },
        InterviewResponse: {
          type: 'object',
          properties: {
            response_id: { type: 'integer' },
            interview_id: { type: 'integer' },
            question_id: { type: 'string' },
            answer: { type: 'string' },
            created_utc: { type: 'string', format: 'date-time' }
          },
          required: ['response_id', 'interview_id', 'question_id', 'answer']
        },
        Finding: {
          type: 'object',
          properties: {
            audit_id: { type: 'integer' },
            pain_points_json: { type: 'array', items: { type: 'string' } },
            opportunities_json: { type: 'array', items: { type: 'string' } },
            recommendations_json: { type: 'array', items: { type: 'string' } },
            updated_utc: { type: 'string', format: 'date-time' }
          },
          required: ['audit_id']
        },
        ProcessMap: {
          type: 'object',
          properties: {
            process_map_id: { type: 'integer' },
            audit_id: { type: 'integer' },
            title: { type: 'string', nullable: true },
            blob_path: { type: 'string' },
            file_type: { type: 'string', nullable: true },
            uploaded_utc: { type: 'string', format: 'date-time' }
          },
          required: ['process_map_id', 'audit_id', 'blob_path']
        },
        UploadUrlResponse: {
          type: 'object',
          properties: {
            uploadUrl: { type: 'string' },
            blob_path: { type: 'string' },
            contentType: { type: 'string' }
          },
          required: ['uploadUrl', 'blob_path', 'contentType']
        },
        ClientsOverviewItem: {
          type: 'object',
          properties: {
            client_id: { type: 'integer' },
            client_name: { type: 'string' },
            is_active: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time' },
            primary_contact_name: { type: 'string', nullable: true },
            primary_contact_email: { type: 'string', nullable: true },
            tags: { type: 'string', nullable: true, description: 'Comma-delimited or JSON string of tags' },
            engagement_count: { type: 'integer' },
            pending_onboarding_tasks: { type: 'integer' },
            last_activity_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['client_id', 'client_name', 'is_active', 'created_utc']
        }
        ,
        ClientContact: {
          type: 'object',
          properties: {
            contact_id: { type: 'integer' },
            client_id: { type: 'integer' },
            first_name: { type: 'string', nullable: true },
            last_name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            is_primary: { type: 'boolean' },
            is_active: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time', nullable: true },
            updated_utc: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        ClientContactCreateBody: {
          type: 'object',
          properties: {
            client_id: { type: 'integer' },
            first_name: { type: 'string', nullable: true },
            last_name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            is_primary: { type: 'boolean' },
            is_active: { type: 'boolean' }
          },
          required: ['client_id']
        },
        ClientContactUpdateBody: {
          type: 'object',
          properties: {
            first_name: { type: 'string', nullable: true },
            last_name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            is_primary: { type: 'boolean' },
            is_active: { type: 'boolean' }
          }
        },
        ContactSocialProfile: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            contact_id: { type: 'integer' },
            provider: { type: 'string' },
            profile_url: { type: 'string' },
            is_primary: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['id', 'contact_id', 'provider', 'profile_url']
        },
        ContactSocialProfileCreateBody: {
          type: 'object',
          properties: {
            contact_id: { type: 'integer' },
            provider: { type: 'string' },
            profile_url: { type: 'string' },
            is_primary: { type: 'boolean' }
          },
          required: ['contact_id', 'provider', 'profile_url']
        },
        ContactSocialProfileUpdateBody: {
          type: 'object',
          properties: {
            contact_id: { type: 'integer' },
            provider: { type: 'string' },
            profile_url: { type: 'string' },
            is_primary: { type: 'boolean' }
          }
        },
        ClientTag: {
          type: 'object',
          properties: {
            tag_id: { type: 'integer' },
            tag_name: { type: 'string' }
          },
          required: ['tag_id', 'tag_name']
        },
        ClientTagCreateBody: {
          type: 'object',
          properties: {
            tag_name: { type: 'string', minLength: 1, maxLength: 200 }
          },
          required: ['tag_name']
        },
        ClientTagUpdateBody: {
          type: 'object',
          properties: {
            tag_name: { type: 'string', minLength: 1, maxLength: 200 }
          }
        },
        ClientCreateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            is_active: { type: 'boolean' },
            logo_url: { type: 'string', maxLength: 512, nullable: true, description: 'Public URL to the client logo (no file upload stored)' }
          },
          required: ['name']
        },
        ClientUpdateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            is_active: { type: 'boolean' },
            logo_url: { type: 'string', maxLength: 512, nullable: true, description: 'Public URL to the client logo (no file upload stored)' }
          }
        },
        CreateProcBody: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200, description: 'The client\'s name (required)' },
            is_active: { type: 'boolean', description: 'Whether the client is active (1) or a prospect (0). Defaults to true if not provided.' },
            pack_code: { type: 'string', maxLength: 64, nullable: true, description: 'A code for onboarding task packs. If not provided, falls back to default tasks.' },
            logo_url: { type: 'string', maxLength: 512, nullable: true, description: 'URL to the client\'s logo image' },
            contacts_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/ContactJsonItem' },
              nullable: true,
              description: 'Array of contact objects to create for the client'
            },
            documents_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/DocumentJsonItem' },
              nullable: true,
              description: 'Array of document objects to create for the client'
            },
            industries_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/IndustryJsonItem' },
              nullable: true,
              description: 'Array of industry associations to create for the client'
            },
            integrations_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/IntegrationJsonItem' },
              nullable: true,
              description: 'Array of integration objects to create for the client'
            },
            locations_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/LocationJsonItem' },
              nullable: true,
              description: 'Array of location objects to create for the client'
            },
            notes_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/NoteJsonItem' },
              nullable: true,
              description: 'Array of note objects to create for the client'
            },
            engagement_tags_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/EngagementTagJsonItem' },
              nullable: true,
              description: 'Array of engagement tag associations (only applies if client is active)'
            },
            contact_social_profiles_json: {
              type: 'array',
              items: { $ref: '#/components/schemas/ContactSocialProfileJsonItem' },
              nullable: true,
              description: 'Array of social profile objects to create for contacts (requires temp_contact_key from contacts_json)'
            }
          },
          description: 'Request body for creating a client via stored procedure sp_create_client. Supports dynamic parameter binding with detailed JSON payloads for related entities.'
        },
        ContactJsonItem: {
          type: 'object',
          properties: {
            first_name: { type: 'string', maxLength: 200, nullable: true },
            last_name: { type: 'string', maxLength: 200, nullable: true },
            email: { type: 'string', maxLength: 320, nullable: true },
            phone: { type: 'string', maxLength: 50, nullable: true },
            title: { type: 'string', maxLength: 200, nullable: true },
            is_primary: { type: 'boolean' },
            is_active: { type: 'boolean' },
            temp_contact_key: { type: 'string', maxLength: 200, nullable: true, description: 'Temporary key to link with social profiles' }
          }
        },
        DocumentJsonItem: {
          type: 'object',
          properties: {
            category: { type: 'string', maxLength: 100 },
            filename: { type: 'string', maxLength: 260 },
            blob_url: { type: 'string', maxLength: 1000 },
            uploaded_by_user: { type: 'integer' },
            uploaded_utc: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        IndustryJsonItem: {
          type: 'object',
          properties: {
            industry_id: { type: 'integer' },
            is_primary: { type: 'boolean' }
          }
        },
        IntegrationJsonItem: {
          type: 'object',
          properties: {
            provider: { type: 'string', maxLength: 100 },
            status: { type: 'string', maxLength: 50 },
            external_account_id: { type: 'string', maxLength: 200 },
            secret_ref: { type: 'string', maxLength: 200 }
          }
        },
        LocationJsonItem: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 200 },
            line1: { type: 'string', maxLength: 200 },
            line2: { type: 'string', maxLength: 200, nullable: true },
            city: { type: 'string', maxLength: 100 },
            state_province: { type: 'string', maxLength: 100 },
            postal_code: { type: 'string', maxLength: 50 },
            country: { type: 'string', maxLength: 100 },
            is_primary: { type: 'boolean' }
          }
        },
        NoteJsonItem: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 200 },
            content: { type: 'string', nullable: true },
            note_type: { type: 'string', maxLength: 50, nullable: true },
            is_important: { type: 'boolean' },
            is_active: { type: 'boolean' },
            created_by: { type: 'integer', nullable: true },
            updated_by: { type: 'integer', nullable: true }
          }
        },
        EngagementTagJsonItem: {
          type: 'object',
          properties: {
            tag_id: { type: 'integer' }
          }
        },
        ContactSocialProfileJsonItem: {
          type: 'object',
          properties: {
            temp_contact_key: { type: 'string', maxLength: 200, nullable: true, description: 'Links to contact from contacts_json' },
            provider: { type: 'string', maxLength: 100 },
            profile_url: { type: 'string' },
            is_primary: { type: 'boolean' }
          }
        },
        ClientSetupBody: {
          type: 'object',
          properties: {
            client_name: { type: 'string' },
            playbook_code: { type: 'string' },
            owner_user_id: { type: 'integer' }
          },
          required: ['playbook_code', 'owner_user_id']
        },
        TaskPack: {
          type: 'object',
          properties: {
            pack_id: { type: 'integer' },
            pack_code: { type: 'string' },
            pack_name: { type: 'string' },
            description: { type: 'string', nullable: true },
            status_scope: { type: 'string', enum: ['active', 'prospect', 'any'], nullable: true },
            is_active: { type: 'boolean' },
            effective_from_utc: { type: 'string', format: 'date-time', nullable: true },
            effective_to_utc: { type: 'string', format: 'date-time', nullable: true },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['pack_id', 'pack_code', 'pack_name', 'is_active']
        },
        TaskPackCreateBody: {
          type: 'object',
          properties: {
            pack_code: { type: 'string', minLength: 1, maxLength: 50 },
            pack_name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000, nullable: true },
            status_scope: { type: 'string', enum: ['active', 'prospect', 'any'], nullable: true },
            is_active: { type: 'boolean' },
            effective_from_utc: { type: 'string', format: 'date-time', nullable: true },
            effective_to_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['pack_code', 'pack_name']
        },
        TaskPackUpdateBody: {
          type: 'object',
          properties: {
            pack_code: { type: 'string', minLength: 1, maxLength: 50 },
            pack_name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000, nullable: true },
            status_scope: { type: 'string', enum: ['active', 'prospect', 'any'], nullable: true },
            is_active: { type: 'boolean' },
            effective_from_utc: { type: 'string', format: 'date-time', nullable: true },
            effective_to_utc: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        PackTask: {
          type: 'object',
          properties: {
            pack_task_id: { type: 'integer' },
            pack_id: { type: 'integer' },
            name: { type: 'string' },
            sort_order: { type: 'integer', nullable: true },
            due_days: { type: 'integer', nullable: true },
            status_scope: { type: 'string', maxLength: 20, nullable: true },
            is_active: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['pack_task_id', 'pack_id', 'name', 'is_active']
        },
        PackTaskCreateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            sort_order: { type: 'integer', nullable: true },
            due_days: { type: 'integer', nullable: true },
            status_scope: { type: 'string', maxLength: 20, nullable: true },
            is_active: { type: 'boolean' }
          },
          required: ['name']
        },
        PackTaskUpdateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            sort_order: { type: 'integer', nullable: true },
            due_days: { type: 'integer', nullable: true },
            status_scope: { type: 'string', maxLength: 20, nullable: true },
            is_active: { type: 'boolean' }
          }
        },
        Industry: {
          type: 'object',
          properties: {
            industry_id: { type: 'integer' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            is_active: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time' },
            updated_utc: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['industry_id', 'name', 'is_active']
        },
        IndustryCreateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000, nullable: true },
            is_active: { type: 'boolean' }
          },
          required: ['name']
        },
        IndustryUpdateBody: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000, nullable: true },
            is_active: { type: 'boolean' }
          }
        },
        ClientIndustry: {
          type: 'object',
          properties: {
            client_id: { type: 'integer' },
            industry_id: { type: 'integer' },
            is_primary: { type: 'boolean' },
            industry_name: { type: 'string' },
            created_utc: { type: 'string', format: 'date-time' }
          },
          required: ['client_id', 'industry_id']
        },
        ClientIndustryCreateBody: {
          type: 'object',
          properties: {
            industry_id: { type: 'integer' },
            is_primary: { type: 'boolean' }
          },
          required: ['industry_id']
        },
        ClientIndustryUpdateBody: {
          type: 'object',
          properties: {
            is_primary: { type: 'boolean' }
          }
        },
        ClientNote: {
          type: 'object',
          properties: {
            note_id: { type: 'integer' },
            client_id: { type: 'integer' },
            title: { type: 'string' },
            content: { type: 'string', nullable: true },
            note_type: { type: 'string', nullable: true },
            is_important: { type: 'boolean' },
            is_active: { type: 'boolean' },
            created_utc: { type: 'string', format: 'date-time', nullable: true },
            updated_utc: { type: 'string', format: 'date-time', nullable: true },
            created_by: { type: 'string', nullable: true },
            updated_by: { type: 'string', nullable: true }
          },
          required: ['note_id', 'client_id', 'title', 'is_important', 'is_active']
        },
        ClientNoteCreateBody: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            content: { type: 'string', maxLength: 10000, nullable: true },
            note_type: { type: 'string', maxLength: 50, nullable: true },
            is_important: { type: 'boolean' },
            is_active: { type: 'boolean' },
            created_by: { type: 'string', maxLength: 100, nullable: true }
          },
          required: ['title']
        },
        ClientNoteUpdateBody: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            content: { type: 'string', maxLength: 10000, nullable: true },
            note_type: { type: 'string', maxLength: 50, nullable: true },
            is_important: { type: 'boolean' },
            is_active: { type: 'boolean' },
            updated_by: { type: 'string', maxLength: 100, nullable: true }
          }
        }
      },
      paths: {
        '/api/task-packs': {
          get: {
            tags: ['TaskPacks'],
            summary: 'List task packs',
            parameters: [
              { name: 'status_scope', in: 'query', schema: { type: 'string', enum: ['active', 'prospect', 'any'] } },
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'include_inactive', in: 'query', schema: { type: 'boolean' } },
              { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
              { name: 'page_size', in: 'query', schema: { type: 'integer', default: 50 } }
            ],
            responses: {
              200: {
                description: 'List of task packs',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/TaskPack' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['TaskPacks'],
            summary: 'Create task pack',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TaskPackCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Task pack created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/TaskPack' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/task-packs/{pack_id}': {
          get: {
            tags: ['TaskPacks'],
            summary: 'Get task pack by id',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Task pack details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/TaskPack' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['TaskPacks'],
            summary: 'Update task pack (full replace)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TaskPackUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Task pack updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/TaskPack' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['TaskPacks'],
            summary: 'Update task pack (partial)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TaskPackUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Task pack updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/TaskPack' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['TaskPacks'],
            summary: 'Delete task pack (soft delete)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Task pack deleted'
              }
            }
          }
        },
        '/api/task-packs/{pack_id}/tasks': {
          get: {
            tags: ['TaskPacks'],
            summary: 'List pack tasks',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'List of pack tasks',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/PackTask' } }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['TaskPacks'],
            summary: 'Create pack task',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PackTaskCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Pack task created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/PackTask' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/task-packs/{pack_id}/tasks/{pack_task_id}': {
          get: {
            tags: ['TaskPacks'],
            summary: 'Get pack task by id',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'pack_task_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Pack task details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/PackTask' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['TaskPacks'],
            summary: 'Update pack task (full replace)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'pack_task_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PackTaskUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Pack task updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/PackTask' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['TaskPacks'],
            summary: 'Update pack task (partial)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'pack_task_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PackTaskUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Pack task updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/PackTask' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['TaskPacks'],
            summary: 'Delete pack task (soft delete)',
            parameters: [
              { name: 'pack_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'pack_task_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Pack task deleted'
              }
            }
          }
        },
        '/api/industries': {
          get: {
            tags: ['Industries'],
            summary: 'List industries',
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'include_inactive', in: 'query', schema: { type: 'boolean' } },
              { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
              { name: 'page_size', in: 'query', schema: { type: 'integer', default: 50 } }
            ],
            responses: {
              200: {
                description: 'List of industries',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/Industry' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['Industries'],
            summary: 'Create industry',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IndustryCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Industry created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/Industry' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/industries/{industry_id}': {
          get: {
            tags: ['Industries'],
            summary: 'Get industry by id',
            parameters: [
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Industry details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/Industry' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['Industries'],
            summary: 'Update industry (full replace)',
            parameters: [
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IndustryUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Industry updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/Industry' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['Industries'],
            summary: 'Update industry (partial)',
            parameters: [
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IndustryUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Industry updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/Industry' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['Industries'],
            summary: 'Delete industry (soft delete)',
            parameters: [
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Industry deleted'
              }
            }
          }
        },
        '/api/clients/{client_id}/industries': {
          get: {
            tags: ['Industries'],
            summary: 'List industries for a client',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'List of client industries',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/ClientIndustry' } }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['Industries'],
            summary: 'Add industry to client',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientIndustryCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Industry added to client',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientIndustry' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/clients/{client_id}/industries/{industry_id}': {
          put: {
            tags: ['Industries'],
            summary: 'Update client industry',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientIndustryUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client industry updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientIndustry' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['Industries'],
            summary: 'Update client industry (partial)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientIndustryUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client industry updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientIndustry' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['Industries'],
            summary: 'Remove industry from client',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'industry_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Industry removed from client'
              }
            }
          }
        },
        '/api/clients/{client_id}/notes': {
          get: {
            tags: ['ClientNotes'],
            summary: 'List notes for a client',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'note_type', in: 'query', schema: { type: 'string' } },
              { name: 'include_inactive', in: 'query', schema: { type: 'boolean' } },
              { name: 'important_only', in: 'query', schema: { type: 'boolean' } },
              { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
              { name: 'page_size', in: 'query', schema: { type: 'integer', default: 50 } }
            ],
            responses: {
              200: {
                description: 'List of client notes',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/ClientNote' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['ClientNotes'],
            summary: 'Create client note',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientNoteCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Client note created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientNote' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/clients/{client_id}/notes/{note_id}': {
          get: {
            tags: ['ClientNotes'],
            summary: 'Get client note by id',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'note_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Client note details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientNote' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['ClientNotes'],
            summary: 'Update client note (full replace)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'note_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientNoteUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client note updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientNote' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['ClientNotes'],
            summary: 'Update client note (partial)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'note_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientNoteUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client note updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientNote' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['ClientNotes'],
            summary: 'Delete client note (soft delete)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'note_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Client note deleted'
              }
            }
          }
        },
        '/api/clients': {
          get: {
            tags: ['Clients'],
            summary: 'List clients',
            parameters: [
              { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }
            ],
            responses: {
              200: {
                description: 'Clients list',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              client_id: { type: 'integer' },
                              name: { type: 'string' },
                              is_active: { type: 'boolean' },
                              logo_url: { type: 'string', nullable: true },
                              created_utc: { type: 'string', format: 'date-time' }
                            }
                          }
                        },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['Clients'],
            summary: 'Create client',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Client created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client_id: { type: 'integer' },
                            name: { type: 'string' },
                            is_active: { type: 'boolean' },
                            logo_url: { type: 'string', nullable: true },
                            created_utc: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/clients/{client_id}': {
          get: {
            tags: ['Clients'],
            summary: 'Get client by id',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Client details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client_id: { type: 'integer' },
                            name: { type: 'string' },
                            is_active: { type: 'boolean' },
                            logo_url: { type: 'string', nullable: true },
                            created_utc: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['Clients'],
            summary: 'Update client (full replace)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client_id: { type: 'integer' },
                            name: { type: 'string' },
                            is_active: { type: 'boolean' },
                            logo_url: { type: 'string', nullable: true },
                            created_utc: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['Clients'],
            summary: 'Update client (partial)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client_id: { type: 'integer' },
                            name: { type: 'string' },
                            is_active: { type: 'boolean' },
                            logo_url: { type: 'string', nullable: true },
                            created_utc: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['Clients'],
            summary: 'Delete client (soft delete)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Client deleted'
              }
            }
          }
        },
        '/api/clients/create-proc': {
          post: {
            tags: ['Clients'],
            summary: 'Create client via stored procedure sp_create_client',
            description: 'Dynamically inspects parameters of app.sp_create_client and binds matching JSON body fields. Any OUTPUT params returned if present along with first recordset row.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateProcBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Client created (procedure result)',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client: {
                              type: 'object',
                              properties: {
                                client_id: { type: 'integer' },
                                name: { type: 'string' },
                                is_active: { type: 'boolean' },
                                logo_url: { type: 'string', nullable: true },
                                created_utc: { type: 'string', format: 'date-time' }
                              }
                            },
                            proc_result: { type: 'object', additionalProperties: true }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/clients/fetch-from-url': {
          post: {
            tags: ['Clients'],
            summary: 'Fetch and extract client data from a URL (e.g., LinkedIn)',
            description: 'Extracts client data from a URL and returns it in a format compatible with the create-proc endpoint',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['url'],
                    properties: {
                      url: { type: 'string', description: 'URL to fetch data from' }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Extracted client data (compatible with create-proc endpoint)',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', nullable: true, description: 'Client name' },
                            logo_url: { type: 'string', nullable: true, description: 'Client logo URL' },
                            is_active: { type: 'boolean', description: 'Whether client should be active (defaults to true)' },
                            contacts_json: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/ContactJsonItem' },
                              description: 'Array of extracted contact objects'
                            },
                            locations_json: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/LocationJsonItem' },
                              description: 'Array of extracted location objects'
                            },
                            industries_json: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/IndustryJsonItem' },
                              description: 'Array of extracted industry associations'
                            },
                            notes_json: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/NoteJsonItem' },
                              description: 'Array of extracted note objects'
                            },
                            contact_social_profiles_json: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/ContactSocialProfileJsonItem' },
                              description: 'Array of extracted social profile objects'
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/clients/{client_id}/setup': {
          post: {
            tags: ['Clients'],
            summary: 'Orchestrate post-creation client setup (idempotent)',
            parameters: [
              { name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientSetupBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Setup executed (idempotent)',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: {
                          type: 'object',
                          properties: {
                            client_slug: { type: 'string' },
                            folders: { type: 'array', items: { type: 'string' } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/client-tags': {
          get: {
            tags: ['ClientTags'],
            summary: 'List client tags',
            parameters: [
              { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }
            ],
            responses: {
              200: {
                description: 'Tags list',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/ClientTag' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['ClientTags'],
            summary: 'Create client tag',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientTagCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Tag created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientTag' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/client-tags/{id}': {
          get: {
            tags: ['ClientTags'],
            summary: 'Get client tag by id',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Tag details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientTag' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['ClientTags'],
            summary: 'Update client tag (full replace)',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientTagUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Tag updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientTag' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['ClientTags'],
            summary: 'Delete client tag',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Tag deleted',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'object', properties: { deleted: { type: 'integer' } } }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/client-contacts': {
          get: {
            tags: ['ClientContacts'],
            summary: 'List client contacts',
            parameters: [
              { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }
            ],
            responses: {
              200: {
                description: 'Contacts list',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/ClientContact' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['ClientContacts'],
            summary: 'Create client contact',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientContactCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Contact created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientContact' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/client-contacts/{id}': {
          get: {
            tags: ['ClientContacts'],
            summary: 'Get client contact by id',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Contact details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientContact' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            tags: ['ClientContacts'],
            summary: 'Update client contact (full replace)',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientContactUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Contact updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientContact' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['ClientContacts'],
            summary: 'Update client contact (partial)',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClientContactUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Contact updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ClientContact' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['ClientContacts'],
            summary: 'Delete client contact',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Contact deleted',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'object', properties: { deleted: { type: 'integer' } } }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/contact-social-profiles': {
          get: {
            tags: ['ContactSocialProfiles'],
            summary: 'List contact social profiles',
            responses: {
              200: {
                description: 'Social profiles list',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'array', items: { $ref: '#/components/schemas/ContactSocialProfile' } },
                        meta: { $ref: '#/components/schemas/PageMeta' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ['ContactSocialProfiles'],
            summary: 'Create contact social profile',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContactSocialProfileCreateBody' }
                }
              }
            },
            responses: {
              201: {
                description: 'Social profile created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ContactSocialProfile' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/contact-social-profiles/{id}': {
          get: {
            tags: ['ContactSocialProfiles'],
            summary: 'Get contact social profile by id',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Social profile details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ContactSocialProfile' }
                      }
                    }
                  }
                }
              }
            }
          },
          patch: {
            tags: ['ContactSocialProfiles'],
            summary: 'Update contact social profile (partial)',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContactSocialProfileUpdateBody' }
                }
              }
            },
            responses: {
              200: {
                description: 'Social profile updated',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { $ref: '#/components/schemas/ContactSocialProfile' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            tags: ['ContactSocialProfiles'],
            summary: 'Delete contact social profile',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
            ],
            responses: {
              200: {
                description: 'Social profile deleted',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['ok'] },
                        data: { type: 'object', properties: { deleted: { type: 'integer' } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

export function setupOpenApi(app: Express) {
  // If a generated snapshot exists (openapi.snapshot.json) prefer serving it so manual
  // edits are visible in Swagger UI (useful for local testing and CI snapshots).
  // Try multiple locations for the snapshot/additions files. In deployed builds the
  // compiled JS lives under `dist/` so files may be placed next to the repo root
  // instead of next to the compiled code. Check both locations and log which one
  // we used so it's easier to debug "No operations defined in spec" in production.
  const candidates = [
    // Primary locations
    path.resolve(__dirname, '../../openapi.snapshot.json'), // next to compiled code (dist/openapi.snapshot.json)
    path.resolve(process.cwd(), 'openapi.snapshot.json'), // repo root / runtime cwd
  path.resolve(process.cwd(), 'api', 'openapi.snapshot.json'), // repo api folder (if cwd is repo root)
  // Parent-of-api fallbacks (when cwd is api/)
  path.resolve(process.cwd(), '..', 'openapi.snapshot.json'),
  path.resolve(process.cwd(), '..', 'api', 'openapi.snapshot.json'),
  path.resolve(process.cwd(), '..', 'frontend-integration-package', 'openapi.snapshot.json'),
  path.resolve(process.cwd(), '..', 'web', 'openapi.snapshot.json'),
    // Additional fallbacks to avoid dev breakage if API snapshot wasn't generated
  path.resolve(process.cwd(), 'frontend-integration-package', 'openapi.snapshot.json'),
  path.resolve(process.cwd(), 'web', 'openapi.snapshot.json')
  ];

  let spec: any;
  let usedSnapshot: string | null = null;

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        if (!raw || !raw.trim()) {
          throw new Error('OpenAPI snapshot file is empty');
        }
        spec = JSON.parse(raw);
        usedSnapshot = p;
        break;
      } catch (err) {
        console.warn('Failed to parse candidate openapi.snapshot.json at', p, err);
      }
    }
  }

  const preferLive = process.env.OPENAPI_USE_SNAPSHOT === 'false';
  if (!spec || preferLive) {
    // No snapshot found or all failed to parse — fall back to swagger-jsdoc generated spec
    spec = swaggerJSDoc(options);
    if (!usedSnapshot) console.warn('No openapi.snapshot.json found; using swagger-jsdoc generated spec. This may result in empty paths in production.');
  }

  // Merge additions from plausible locations (prefer same directory resolution strategy)
  // By default merging is disabled to avoid runtime parse errors from stray files.
  // Set OPENAPI_MERGE_ADDITIONS=true in the environment to enable merging.
  const additionsCandidates = [
    path.resolve(__dirname, '../../openapi.additions.json'),
    path.resolve(process.cwd(), 'openapi.additions.json'),
    path.resolve(process.cwd(), 'api', 'openapi.additions.json')
  ];
  const mergeAdds = process.env.OPENAPI_MERGE_ADDITIONS === 'true';
  if (!mergeAdds) {
    console.info('Skipping openapi.additions.json merge; set OPENAPI_MERGE_ADDITIONS=true to enable');
  } else {
    for (const aPath of additionsCandidates) {
      if (fs.existsSync(aPath)) {
        try {
          const addRaw = fs.readFileSync(aPath, 'utf8');
          const adds = JSON.parse(addRaw);
          spec.paths = Object.assign({}, spec.paths || {}, adds.paths || {});
          if (adds.components && adds.components.schemas) {
            spec.components = spec.components || {};
            spec.components.schemas = Object.assign({}, spec.components.schemas || {}, adds.components.schemas || {});
          }
          console.info('Merged OpenAPI additions from', aPath);
          break; // merge first found additions file
        } catch (e) {
          console.warn('Failed to merge openapi.additions.json at', aPath, e);
        }
      }
    }
  }

  if (usedSnapshot) {
    console.info('Serving openapi snapshot from', usedSnapshot);
  }

  // Auto-tag any operations lacking tags using path heuristics to avoid the 'default' bucket
  try {
    const pathTagMap: Array<{ prefix: string; tag: string }> = [
      { prefix: '/api/ai', tag: 'AI' },
      { prefix: '/api/auto', tag: 'Auto' },
      { prefix: '/api/audits', tag: 'Audits' },
      { prefix: '/api/audit-sipoc', tag: 'SIPOC' },
      { prefix: '/api/audit-step-progress', tag: 'Audit Step Progress' },
      { prefix: '/api/interviews', tag: 'Interviews' },
      { prefix: '/api/interview-responses', tag: 'Interview Responses' },
      { prefix: '/api/findings', tag: 'Findings' },
      { prefix: '/api/process-maps', tag: 'Process Maps' },
      { prefix: '/api/path-templates', tag: 'PathTemplates' },
      { prefix: '/api/path-steps', tag: 'PathSteps' },
      { prefix: '/api/clients', tag: 'Clients' },
      { prefix: '/api/client-contacts', tag: 'ClientContacts' },
      { prefix: '/api/client-documents', tag: 'ClientDocuments' },
      { prefix: '/api/client-engagements', tag: 'ClientEngagements' },
      { prefix: '/api/client-integrations', tag: 'ClientIntegrations' },
      { prefix: '/api/client-locations', tag: 'ClientLocations' },
      { prefix: '/api/client-onboarding-tasks', tag: 'ClientOnboardingTasks' },
      { prefix: '/api/onboarding-tasks', tag: 'ClientOnboardingTasks' },
      { prefix: '/api/client-tag-map', tag: 'ClientTagMap' },
      { prefix: '/api/client-tags', tag: 'ClientTags' },
      { prefix: '/api/contact-social-profiles', tag: 'ContactSocialProfiles' },
      { prefix: '/api/industries', tag: 'Industries' },
      { prefix: '/api/task-packs', tag: 'TaskPacks' },
      { prefix: '/api/dashboard-stats', tag: 'Views' },
      { prefix: '/api/audit-recent-touch', tag: 'Views' },
      { prefix: '/api/clients-overview', tag: 'Views' },
    ];
    const httpMethods = ['get','post','put','patch','delete','options','head','trace'];
    for (const p of Object.keys(spec.paths || {})) {
      const ops = spec.paths[p];
      for (const m of httpMethods) {
        const op = ops?.[m];
        if (!op) continue;
        const hasTags = Array.isArray(op.tags) && op.tags.length > 0 && op.tags[0] !== 'default';
        if (!hasTags) {
          const found = pathTagMap.find(t => p.startsWith(t.prefix));
          op.tags = [found?.tag || 'Misc'];
        }
      }
    }
    // Also mark webhook endpoints
    for (const p of Object.keys(spec.paths || {})) {
      if (p.startsWith('/webhooks')) {
        const ops = spec.paths[p];
        for (const m of httpMethods) {
          const op = ops?.[m];
          if (!op) continue;
          const hasTags = Array.isArray(op.tags) && op.tags.length > 0 && op.tags[0] !== 'default';
          if (!hasTags) op.tags = ['Webhooks'];
        }
      }
    }
  } catch (e) {
    console.warn('Auto-tagging OpenAPI operations failed:', e);
  }

  // Normalize tags and x-tagGroups so UI shows clean groups
  try {
    const discovered = new Set<string>();
    const httpMethods = ['get','post','put','patch','delete','options','head','trace'];
    for (const p of Object.keys(spec.paths || {})) {
      const ops = spec.paths[p];
      for (const m of httpMethods) {
        const op = ops?.[m];
        if (!op) continue;
        const opTags: string[] = Array.isArray(op.tags) ? op.tags : [];
        for (const t of opTags) discovered.add(t);
      }
    }
    const curated = (options.definition as any)?.tags ?? [];
    const merged: Array<{ name: string; description?: string }> = [];
    const byName = new Map<string, { name: string; description?: string }>();
    for (const t of curated) byName.set(t.name, t);
    for (const t of discovered) if (!byName.has(t)) byName.set(t, { name: t });
    for (const t of byName.values()) merged.push(t);
    spec.tags = merged.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    if (!spec['x-tagGroups']) spec['x-tagGroups'] = (options.definition as any)['x-tagGroups'];
  } catch (e) {
    console.warn('Failed to normalize OpenAPI tags:', e);
  }

  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerServe, swaggerSetup(spec, {
    explorer: true,
    swaggerOptions: {
      deepLinking: true,
      displayOperationId: false,
      filter: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha'
    },
    customCss: '.swagger-ui .topbar { display: none }'
  }));

  // Lightweight Redoc UI without extra dependency
  app.get('/api/redoc', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FlowLedger API Docs (ReDoc)</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style> body { margin: 0; padding: 0; } </style>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
  </body>
</html>`);
  });
}
