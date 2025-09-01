import request from 'supertest';
import { createApp } from '../src/server';

// Mock the DB pool to avoid real DB dependency during tests
jest.mock('../src/db/pool', () => {
  const sql = {
    Int: () => 'Int',
    NVarChar: (_len?: number) => 'NVarChar',
    DateTime2: () => 'DateTime2',
    MAX: () => 'MAX',
    Bit: () => 'Bit'
  } as any;
  // Minimal fake request builder
  const fakeRequest = () => ({
    input: () => fakeRequest(),
    query: async (q: string) => {
      const sql = String(q || '').toLowerCase();
      // engagementExists / client_engagements lookup
      if (sql.includes('from app.client_engagements') && sql.includes('where engagement_id')) {
        return { recordset: [{ engagement_id: 10, client_id: 5 }], rowsAffected: [1] };
      }
      // fallback selects for audits by id return a default row
      if (sql.includes('from app.audits where')) {
        return { recordset: [{ audit_id: 123, engagement_id: 10, client_id: 5, title: 'Created', percent_complete: 0 }], rowsAffected: [1] };
      }
      return { recordset: [], rowsAffected: [0] };
    },
    execute: async (sp: string) => {
      if (sp === 'app.sp_audit_create') {
        return { recordset: [{ audit_id: 123, engagement_id: 10, client_id: 5, title: 'Created', percent_complete: 0 }], output: {} };
      }
      if (sp === 'app.sp_audit_list_by_engagement') {
        return { recordset: [{ audit_id: 123, engagement_id: 10, client_id: 5, title: 'Created', percent_complete: 0 }] };
      }
      if (sp === 'app.sp_audit_list_by_client') {
        return { recordset: [{ audit_id: 123, engagement_id: 10, client_id: 5, title: 'Created', percent_complete: 0 }] };
      }
      return { recordset: [] };
    }
  });
  return {
    getPool: async () => ({ request: fakeRequest, close: async () => {} }),
    sql
  };
});

describe('Audits API (integration - mocked DB)', () => {
  let app: any;
  beforeAll(async () => {
    app = await createApp();
  });

  test('POST /api/audits returns created object and Location header', async () => {
    const res = await request(app).post('/api/audits').send({ title: 'Created', engagement_id: 10 });
    if (res.status !== 201) console.error('POST /api/audits failed:', res.status, res.body || res.text);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/audits/123');
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.data).toMatchObject({ audit_id: 123, engagement_id: 10, client_id: 5 });
    expect(typeof res.body.data.audit_id).toBe('number');
  });

  test('GET /api/audits?engagement_id=10 returns numeric ids', async () => {
    const res = await request(app).get('/api/audits').query({ engagement_id: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ audit_id: 123, engagement_id: 10, client_id: 5 });
    expect(typeof res.body.data[0].audit_id).toBe('number');
  });
});
