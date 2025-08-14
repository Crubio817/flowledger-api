import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, ok, listOk, badRequest, notFound } from '../utils/http';
import { env } from '../config/env';

// VERY SIMPLE auto CRUD + view/proc exposure for rapid iteration.
// Not for production without auth/allowlists.

const router = Router();

if (env.features.autoApi) {
  // Feature enabled: mount dynamic endpoints

  // Helper to validate identifier (table/view/proc names)
  function ident(name: string) {
    if (!/^\w+$/.test(name)) throw new Error('Invalid identifier');
    return name;
  }

  // Simple in-memory cache for allowlists (refreshed on demand)
  let tableCache: string[] | null = null;
  let viewCache: string[] | null = null;
  let procCache: string[] | null = null;

  async function loadTables() {
    if (tableCache) return tableCache;
    let tries = 0;
    while (tries < 3) {
      try {
        const pool = await getPool();
  const r = await pool.request().query("SELECT t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='app' ORDER BY t.name");
        tableCache = r.recordset.map(r=>r.name);
        return tableCache;
      } catch (e) {
        console.error('loadTables error:', e);
        await new Promise(r => setTimeout(r, 1000));
        tries++;
      }
    }
    throw new Error('Failed to load tables after 3 attempts');
  }
  async function loadViews() {
    if (viewCache) return viewCache;
    let tries = 0;
    while (tries < 3) {
      try {
        const pool = await getPool();
  const r = await pool.request().query("SELECT v.name FROM sys.views v JOIN sys.schemas s ON v.schema_id=s.schema_id WHERE s.name='app' ORDER BY v.name");
        viewCache = r.recordset.map(r=>r.name.replace(/^v_/,'').replace(/^app_v_/,'').replace(/^app\./,''));
        return viewCache;
      } catch (e) {
        console.error('loadViews error:', e);
        await new Promise(r => setTimeout(r, 1000));
        tries++;
      }
    }
    throw new Error('Failed to load views after 3 attempts');
  }
  async function loadProcs() {
    if (procCache) return procCache;
    let tries = 0;
    while (tries < 3) {
      try {
        const pool = await getPool();
  const r = await pool.request().query("SELECT p.name FROM sys.procedures p JOIN sys.schemas s ON p.schema_id=s.schema_id WHERE s.name='app' ORDER BY p.name");
        procCache = r.recordset.map(r=>r.name);
        return procCache;
      } catch (e) {
        console.error('loadProcs error:', e);
        await new Promise(r => setTimeout(r, 1000));
        tries++;
      }
    }
    throw new Error('Failed to load procs after 3 attempts');
  }

  // Refresh caches endpoint
  router.post('/meta/refresh', asyncHandler(async (_req, res) => {
    tableCache = viewCache = procCache = null;
    await Promise.all([loadTables(), loadViews(), loadProcs()]);
    ok(res, { refreshed: true });
  }));

  // List tables (from app schema only)
  router.get('/meta/tables', asyncHandler(async (_req, res) => {
    try {
      ok(res, await loadTables());
    } catch (e) {
      console.error('meta/tables error:', e);
  badRequest(res, (e instanceof Error ? e.message : String(e)) || 'Unknown error');
    }
  }));

  // List views
  router.get('/meta/views', asyncHandler(async (_req, res) => {
    try {
      ok(res, await loadViews());
    } catch (e) {
      console.error('meta/views error:', e);
  badRequest(res, (e instanceof Error ? e.message : String(e)) || 'Unknown error');
    }
  }));

  // List stored procedures
  router.get('/meta/procs', asyncHandler(async (_req, res) => {
    try {
      ok(res, await loadProcs());
    } catch (e) {
      console.error('meta/procs error:', e);
  badRequest(res, (e instanceof Error ? e.message : String(e)) || 'Unknown error');
    }
  }));

  // Basic SELECT * with pagination for a table
  router.get('/tables/:table', asyncHandler(async (req, res) => {
  const table = ident(req.params.table);
  const tables = await loadTables();
  if (!tables.includes(table)) return notFound(res, 'Unknown table');
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const q = `SELECT * FROM app.${table} ORDER BY 1 OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`;
    const result = await pool.request().input('off', sql.Int, offset).input('lim', sql.Int, limit).query(q);
    listOk(res, result.recordset, { page, limit });
  }));

  // Get by single integer id column (convention: <table>_id)
  router.get('/tables/:table/:id', asyncHandler(async (req, res) => {
  const table = ident(req.params.table);
  const tables = await loadTables();
  if (!tables.includes(table)) return notFound(res, 'Unknown table');
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return badRequest(res, 'id must be int');
    const idCol = `${table.endsWith('s')? table.slice(0,-1): table}_id`; // naive heuristic
    const pool = await getPool();
    const q = `SELECT * FROM app.${table} WHERE ${idCol} = @id`;
    const r = await pool.request().input('id', sql.Int, id).query(q);
    const row = r.recordset[0];
    if (!row) return notFound(res);
    ok(res, row);
  }));

  // Insert (JSON body -> columns). Expects object with direct scalar props. No validation.
  router.post('/tables/:table', asyncHandler(async (req, res) => {
  const table = ident(req.params.table);
  const tables = await loadTables();
  if (!tables.includes(table)) return notFound(res, 'Unknown table');
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)) return badRequest(res, 'Body must be object');
    const keys = Object.keys(body);
    if (!keys.length) return badRequest(res, 'No fields');
    const pool = await getPool();
    const request = pool.request();
    const cols: string[] = []; const vals: string[] = [];
    keys.forEach(k => { cols.push(k); vals.push('@'+k); request.input(k, body[k]); });
    await request.query(`INSERT INTO app.${table} (${cols.join(',')}) VALUES (${vals.join(',')})`);
    ok(res, { inserted: 1 }, 201);
  }));

  // Update by id (heuristic id col). Body keys -> SET columns.
  router.put('/tables/:table/:id', asyncHandler(async (req, res) => {
  const table = ident(req.params.table);
  const tables = await loadTables();
  if (!tables.includes(table)) return notFound(res, 'Unknown table');
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return badRequest(res, 'id must be int');
    const body = req.body || {};
    const keys = Object.keys(body);
    if (!keys.length) return badRequest(res, 'No fields');
    const idCol = `${table.endsWith('s')? table.slice(0,-1): table}_id`;
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets: string[] = [];
    keys.forEach(k => { sets.push(`${k}=@${k}`); request.input(k, body[k]); });
    const result = await request.query(`UPDATE app.${table} SET ${sets.join(', ')} WHERE ${idCol}=@id`);
    if (!result.rowsAffected[0]) return notFound(res);
    ok(res, { updated: result.rowsAffected[0] });
  }));

  // Delete by id
  router.delete('/tables/:table/:id', asyncHandler(async (req, res) => {
    const table = ident(req.params.table);
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return badRequest(res, 'id must be int');
    const idCol = `${table.endsWith('s')? table.slice(0,-1): table}_id`;
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.${table} WHERE ${idCol}=@id`);
    if (!result.rowsAffected[0]) return notFound(res);
    ok(res, { deleted: result.rowsAffected[0] });
  }));

  // Views with optional simple equality filters (?field=value) and pagination
  router.get('/views/:view', asyncHandler(async (req, res) => {
  const view = ident(req.params.view);
  const views = await loadViews();
  if (!views.includes(view) && !views.includes(`v_${view}`)) return notFound(res, 'Unknown view');
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const filters: string[] = []; const request = pool.request();
    Object.entries(req.query).forEach(([k,v])=>{ if(['page','limit'].includes(k)) return; if(/^\w+$/.test(k)){ filters.push(`${k} = @f_${k}`); request.input(`f_${k}`, v as any);} });
    const where = filters.length? 'WHERE '+filters.join(' AND '): '';
    const q = `SELECT * FROM app.v_${view} ${where} ORDER BY 1 OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`;
    request.input('off', sql.Int, offset).input('lim', sql.Int, limit);
    const r = await request.query(q);
    listOk(res, r.recordset, { page, limit });
  }));

  // Execute stored procedure (no args or simple scalar query args passed as @param=value)
  router.get('/procs/:proc', asyncHandler(async (req, res) => {
  const proc = ident(req.params.proc);
  const procs = await loadProcs();
  if (!procs.includes(proc)) return notFound(res, 'Unknown proc');
    const pool = await getPool();
    const request = pool.request();
    Object.entries(req.query).forEach(([k,v])=>{ if(/^\w+$/.test(k)) request.input(k, v as any); });
    const r = await request.execute(`app.${proc}`);
    ok(res, r.recordset ?? r.returnValue);
  }));

}

export default router;
