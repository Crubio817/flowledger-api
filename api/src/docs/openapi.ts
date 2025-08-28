import fs from 'fs';
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';
import { Express } from 'express';
import { serve as swaggerServe, setup as swaggerSetup } from 'swagger-ui-express';

const options: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'FlowLedger API',
      version: '0.1.0'
    },
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
        }
      }
    }
  },
  apis: ['src/**/*.ts']
};

export function setupOpenApi(app: Express) {
  // If a generated snapshot exists (openapi.snapshot.json) prefer serving it so manual
  // edits are visible in Swagger UI (useful for local testing and CI snapshots).
  const snapshotPath = path.resolve(__dirname, '../../openapi.snapshot.json');
  let spec: any;
  if (fs.existsSync(snapshotPath)) {
    try {
      const raw = fs.readFileSync(snapshotPath, 'utf8');
      spec = JSON.parse(raw);
    } catch (err) {
      // if parsing fails, fall back to generated spec
      console.warn('Failed to read openapi.snapshot.json, falling back to swagger-jsdoc', err);
      spec = swaggerJSDoc(options);
    }
  } else {
    spec = swaggerJSDoc(options);
  }
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerServe, swaggerSetup(spec));
}
