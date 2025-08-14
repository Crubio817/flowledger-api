import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env from current working directory first (default behavior)
dotenv.config();
// Also attempt to load from common fallbacks so root .env works in dev and dist
const candidates = [
  path.resolve(__dirname, '../../.env'), // when running from dist/ (dist/config -> ../../.env => project root)
  path.resolve(__dirname, '../../../.env'), // when running from src/ with ts-node-dev (src/config -> ../../../.env => project root)
  path.resolve(__dirname, '../.env'), // sibling to config (api/src/.env or api/dist/.env)
];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}

const bool = (v: string | undefined, d = false) => {
  if (v === undefined) return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  sql: {
    server: process.env.SQL_SERVER || '',
    database: process.env.SQL_DATABASE || '',
    user: process.env.SQL_USER || '',
    password: process.env.SQL_PASSWORD || '',
    // Authentication mode for SQL connections:
    //  - 'sql' (default): SQL username/password
    //  - 'aad-msi': Azure Managed Identity (App Service/Functions MSI endpoint)
    //  - 'aad-default': Azure AD Default Credential (uses environment/managed identity if available)
    //  - 'aad-access-token': Acquire token via DefaultAzureCredential and pass to driver
    auth: (process.env.SQL_AUTH || 'sql').toLowerCase() as 'sql' | 'aad-msi' | 'aad-default' | 'aad-access-token',
    pool: {
      min: Number(process.env.SQL_POOL_MIN || 0),
      max: Number(process.env.SQL_POOL_MAX || 10),
      idleTimeoutMs: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000)
    },
    options: {
      encrypt: bool(process.env.SQL_ENCRYPT, true),
      trustServerCertificate: bool(process.env.SQL_TRUST_SERVER_CERTIFICATE, false)
    }
  },
  azure: {
    managedIdentityClientId: process.env.AZURE_CLIENT_ID || process.env.MI_CLIENT_ID || undefined,
    tenantId: process.env.AZURE_TENANT_ID || process.env.TENANT_ID || undefined
  },
  features: {
    autoApi: ['1','true','yes','on'].includes((process.env.AUTO_API||'').toLowerCase())
  }
};

export function assertConfig() {
  const missing: string[] = [];
  if (!env.sql.server) missing.push('SQL_SERVER');
  if (!env.sql.database) missing.push('SQL_DATABASE');
  // Only require SQL_USER/PASSWORD for 'sql' auth
  if (env.sql.auth === 'sql') {
    if (!env.sql.user) missing.push('SQL_USER');
    if (!env.sql.password) missing.push('SQL_PASSWORD');
  }
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
