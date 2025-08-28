import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import auto from './routes/auto';
import { setupOpenApi } from './docs/openapi';

async function start() {
  // If KeyVault is configured, hydrate secrets first
  try { await (await import('./config/env')).loadKeyVaultSecrets(); } catch { /* ignore */ }
  (await import('./config/env')).assertConfig();
  const app = express();
app.use(helmet());
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
app.use('/api/client-engagements', clientEngagements);
app.use('/api/client-integrations', clientIntegrations);
app.use('/api/client-locations', clientLocations);
app.use('/api/client-contacts', clientContacts);
app.use('/api/client-onboarding-tasks', clientOnboarding);
app.use('/api/client-documents', clientDocuments);
app.use('/api/client-tags', clientTags);
app.use('/api/client-tag-map', clientTagMap);
app.use('/api/contact-social-profiles', contactSocialProfiles);

app.use(errorHandler);

// OpenAPI (must be after routes so annotations are picked up by scanner)
setupOpenApi(app);

  const { env } = await import('./config/env');
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} (sql.auth=${env.sql.auth})`);
  });
}

start().catch(err => { console.error('Failed to start server', err); process.exit(1); });
