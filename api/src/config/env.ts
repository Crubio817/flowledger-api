const dotenv = require('dotenv');
import fs from 'fs';
import path from 'path';
import { getSecret } from './keyvault';

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
    // Load candidate .env files but do NOT override environment variables
    // that were explicitly set (for example via `PORT=4001 node ...`). This
    // ensures runtime invocations can override repository .env defaults.
    dotenv.config({ path: p });
  }
}

const bool = (v: string | undefined, d = false) => {
  if (v === undefined) return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export const env = {
  port: Number(process.env.PORT || 4001),
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
  keyVault: {
    enabled: ['1','true','yes','on'].includes((process.env.USE_AZURE_KEYVAULT||'').toLowerCase()),
    vaultName: process.env.AZURE_KEY_VAULT_NAME || process.env.KEY_VAULT_NAME || ''
  },
  features: {
    autoApi: ['1','true','yes','on'].includes((process.env.AUTO_API||'').toLowerCase())
  }
};

// If KeyVault is enabled, attempt to read sensitive secrets and copy into process.env
export async function loadKeyVaultSecrets() {
  if (!env.keyVault.enabled || !env.keyVault.vaultName) return;
  const vault = env.keyVault.vaultName;
  // mapping of canonical env keys -> possible Key Vault secret name variants
  // Note: Azure Key Vault secret names cannot contain underscores. Prefer condensed names; optionally include hyphenated forms.
  const candidates: Record<string, string[]> = {
    // Only load SQL user/password if using SQL auth; for AAD modes these are not needed
    ...(env.sql.auth === 'sql' ? { SQL_PASSWORD: ['SQLPASSWORD'], SQL_USER: ['SQLUSER'] } : {}),
    SQL_SERVER: ['SQLSERVER', 'SQL-SERVER'],
    SQL_DATABASE: ['SQLDATABASE', 'SQL-DATABASE'],
    JWT_SECRET: ['JWTSECRET', 'JWT-SECRET'],
    // For OpenAI, avoid hyphens per org policy; use condensed names
    OPENAI_API_KEY: ['OPENAIAPIKEY']
  };

  // try variants for each canonical name and hydrate process.env with the first one found
  for (const [canonical, variants] of Object.entries(candidates)) {
    let found = false;
    for (const name of variants) {
      try {
        const v = await getSecret(vault, name);
        if (v) {
          process.env[canonical] = v;
          // if the canonical is JWT_SECRET also mirror to env.jwtSecret for immediate use
          if (canonical === 'JWT_SECRET') {
            // keep env.jwtSecret in sync if server is reading it after loadKeyVaultSecrets
          }
          found = true;
          break;
        }
      } catch (err) {
        // continue trying other variants; log at debug level
        const e = err as unknown as { message?: string };
        console.warn(`loadKeyVaultSecrets: lookup ${name} error`, e?.message ?? err);
      }
    }
    if (!found) {
      // not found in Key Vault; leave existing process.env as-is
      // no-op
    }
  }
  // After attempting to hydrate, mirror common envs into the exported env object
  // so that callers who read `env` after loadKeyVaultSecrets see updated values.
  // Update jwtSecret and SQL connection pieces if newly set on process.env.
  if (process.env.JWT_SECRET) {
     
    (env as any).jwtSecret = process.env.JWT_SECRET;
  }
  if (process.env.SQL_SERVER) {
    (env as any).sql.server = process.env.SQL_SERVER;
  }
  if (process.env.SQL_DATABASE) {
    (env as any).sql.database = process.env.SQL_DATABASE;
  }
  if (process.env.SQL_USER) {
    (env as any).sql.user = process.env.SQL_USER;
  }
  if (process.env.SQL_PASSWORD) {
    (env as any).sql.password = process.env.SQL_PASSWORD;
  }
}

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
