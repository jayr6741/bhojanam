import { pool } from '../config/db.js';
export async function getHealth(_req, res) {
  const result = { status: 'ok', service: 'bhojanam-api', database: 'not-configured' };
  if (pool) {
    try { await pool.query('SELECT 1'); result.database = 'connected'; }
    catch { result.status = 'degraded'; result.database = 'disconnected'; return res.status(503).json(result); }
  }
  res.json(result);
}
