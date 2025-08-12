import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, assertConfig } from './config/env';
import { errorHandler } from './middleware/error';
import clients from './routes/clients';
import audits from './routes/audits';
import views from './routes/views';
import auditSipoc from './routes/audit_sipoc';
import interviews from './routes/interviews';
import interviewResponses from './routes/interview_responses';
import findings from './routes/findings';
import processMaps from './routes/process_maps';
import { setupOpenApi } from './docs/openapi';

assertConfig();

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

app.use(errorHandler);

// OpenAPI (must be after routes so annotations are picked up by scanner)
setupOpenApi(app);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port} (sql.auth=${env.sql.auth})`);
});
