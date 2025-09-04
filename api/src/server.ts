import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// Load dotenv early so any services reading process.env at import time see values
import './config/env';
// config/env is imported dynamically to allow Key Vault secret hydration before assertions
import { errorHandler } from './middleware/error';
import clients from './routes/clients';
import audits from './routes/audits';
import views from './routes/views';
import clientEngagements from './routes/client_engagements';
import clientIntegrations from './routes/client_integrations';
import clientLocations from './routes/client_locations';
import clientContacts from './routes/client_contacts';
import clientOnboarding from './routes/client_onboarding_tasks';
import clientDocuments from './routes/client_documents';
import clientTags from './routes/client_tags';
import clientTagMap from './routes/client_tag_map';
import auditSipoc from './routes/audit_sipoc';
import contactSocialProfiles from './routes/contact_social_profiles';
import interviews from './routes/interviews';
import interviewResponses from './routes/interview_responses';
import findings from './routes/findings';
import processMaps from './routes/process_maps';
import pathTemplates from './routes/path_templates';
import pathSteps from './routes/path_steps';
import auditStepProgress from './routes/audit_step_progress';
import auto from './routes/auto';
import ai from './routes/ai';
import taskPacks from './routes/task_packs';
import industries from './routes/industries';
import clientNotes from './routes/client_notes';
import { setupOpenApi } from './docs/openapi';

export async function createApp() {
  // If KeyVault is configured, hydrate secrets first
  try { await (await import('./config/env')).loadKeyVaultSecrets(); } catch { /* ignore */ }
  // Be tolerant during startup: if required SQL env is missing, log but continue so /healthz and /api/docs work.
  try {
    (await import('./config/env')).assertConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[startup] Configuration validation failed:', msg);
    console.error('[startup] Server will still start, but DB-backed endpoints may fail until settings are fixed.');
  }
  const app = express();
  // Minimal middleware: enable JSON parsing and CORS for API routes
  // You can re-enable helmet if needed once routes are stable
  // app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

/**
 * @openapi
 * /healthz:
 *   get:
 *     summary: Liveness
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
// Alias for convenience
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: API health
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/clients', clients);
app.use('/api/audits', audits);
app.use('/api/views', views);
// Expose view endpoints also directly under /api for shorter paths
app.use('/api', views);
app.use('/api/audit-sipoc', auditSipoc);
app.use('/api/interviews', interviews);
app.use('/api/interview-responses', interviewResponses);
app.use('/api/findings', findings);
app.use('/api/process-maps', processMaps);
app.use('/api/auto', auto); // dynamic auto-generated endpoints (guarded by feature flag)
app.use('/api/ai', ai);
app.use('/api/client-engagements', clientEngagements);
app.use('/api/client-integrations', clientIntegrations);
app.use('/api/client-locations', clientLocations);
app.use('/api/client-contacts', clientContacts);
app.use('/api/client-onboarding-tasks', clientOnboarding);
// Historic/short path: keep `/api/onboarding-tasks` working for callers that expect the
// shorter path (OpenAPI snapshot and some clients use this). Alias to the same router.
app.use('/api/onboarding-tasks', clientOnboarding);
app.use('/api/client-documents', clientDocuments);
app.use('/api/client-tags', clientTags);
app.use('/api/client-tag-map', clientTagMap);
app.use('/api/contact-social-profiles', contactSocialProfiles);
app.use('/api/path-templates', pathTemplates);
app.use('/api/path-steps', pathSteps);
app.use('/api/audit-step-progress', auditStepProgress);
app.use('/api/task-packs', taskPacks);
app.use('/api/industries', industries);
app.use('/api', clientNotes);

app.use(errorHandler);

// OpenAPI (must be after routes so annotations are picked up by scanner)
    try {
      const { setupOpenApi } = await import('./docs/openapi');
      setupOpenApi(app);
    } catch (e) {
      console.warn('[startup] OpenAPI setup failed:', e);
    }
// setupOpenApi(app);
  return app;
}

// If run directly, start listener (preserve original CLI behavior)
if (require.main === module) {
  createApp().then(async (app) => {
    const { env } = await import('./config/env');
    app.listen(env.port, () => {
      console.log(`API listening on http://localhost:${env.port} (sql.auth=${env.sql.auth})`);
    });
  }).catch(err => { console.error('Failed to start server', err); process.exit(1); });
}
