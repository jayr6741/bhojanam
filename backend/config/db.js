import pg from 'pg';
const { Pool } = pg;
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 10), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
  : null;
export async function query(text, params = []) {
  if (!pool) throw Object.assign(new Error('DATABASE_URL is not configured'), { statusCode: 503 });
  return pool.query(text, params);
}
