import * as sql from 'mssql';
import { env } from '../config/env';
import type { ConnectionPool, config as SqlConfig } from 'mssql';
// We conditionally import @azure/identity only when needed to avoid hard dependency at runtime if not installed
let getAccessToken: (() => Promise<string>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const identity = require('@azure/identity') as typeof import('@azure/identity');
  getAccessToken = async () => {
  const { DefaultAzureCredential, ManagedIdentityCredential } = identity as any;
  // Scope for Azure SQL
  const scope = 'https://database.windows.net/.default';
    // Prefer explicit MI client id if provided
    const credential = env.azure.managedIdentityClientId
      ? new ManagedIdentityCredential(env.azure.managedIdentityClientId)
      : new DefaultAzureCredential();
    const token = await credential.getToken(scope);
    if (!token?.token) throw new Error('Failed to acquire Azure AD access token');
    return token.token;
  };
} catch {
  // @azure/identity not installed; only needed if auth requires it
}

let pool: ConnectionPool | null = null;

export async function getPool(): Promise<ConnectionPool> {
  if (pool && pool.connected) return pool;
  const base: Partial<SqlConfig> = {
    server: env.sql.server.replace(/^tcp:/, ''),
    database: env.sql.database,
    options: {
      encrypt: env.sql.options.encrypt,
      trustServerCertificate: env.sql.options.trustServerCertificate,
      enableArithAbort: true
    },
    pool: { max: env.sql.pool.max, min: env.sql.pool.min, idleTimeoutMillis: env.sql.pool.idleTimeoutMs }
  };

  let cfg: SqlConfig;
  const authMode = env.sql.auth;
  if (authMode === 'sql') {
    cfg = {
      ...base,
      user: env.sql.user,
      password: env.sql.password,
    } as SqlConfig;
  } else if (authMode === 'aad-access-token') {
    if (!getAccessToken) {
      throw new Error("SQL_AUTH is 'aad-access-token' but @azure/identity is not installed");
    }
    const token = await getAccessToken();
    cfg = {
      ...base,
      authentication: {
        type: 'azure-active-directory-access-token' as any,
        options: { token }
      }
    } as unknown as SqlConfig;
  } else if (authMode === 'aad-default') {
    // Let tedious handle DefaultAzureCredential internally
    cfg = {
      ...base,
      authentication: {
        type: 'azure-active-directory-default' as any,
        options: env.azure.managedIdentityClientId ? { clientId: env.azure.managedIdentityClientId } : {}
      }
    } as unknown as SqlConfig;
  } else if (authMode === 'aad-msi') {
    // App Service/Functions MSI via tedious built-in types
    cfg = {
      ...base,
      authentication: {
        type: 'azure-active-directory-msi-app-service' as any,
        options: env.azure.managedIdentityClientId ? { clientId: env.azure.managedIdentityClientId } : {}
      }
    } as unknown as SqlConfig;
  } else {
    // Fallback to SQL user/pass
    cfg = {
      ...base,
      user: env.sql.user,
      password: env.sql.password
    } as SqlConfig;
  }

  // Brief startup log (non-sensitive)
  if (!pool) {
    // eslint-disable-next-line no-console
    console.log(`[db] Connecting using auth=${authMode}${authMode === 'sql' ? ` user=${env.sql.user}` : env.azure.managedIdentityClientId ? ` miClientId=${env.azure.managedIdentityClientId}` : ''}`);
  }
  pool = await sql.connect(cfg);
  return pool;
}

export { sql };
