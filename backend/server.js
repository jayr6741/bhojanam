import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
const app = express();
const port = Number(process.env.PORT || 5000);
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', async (_req, res) => {
  const result = { status: 'ok', service: 'bhojanam-api', database: 'not-configured' };
  if (pool) {
    try { await pool.query('SELECT 1'); result.database = 'connected'; }
    catch { result.status = 'degraded'; result.database = 'disconnected'; return res.status(503).json(result); }
  }
  res.json(result);
});
app.get('/api', (_req, res) => res.json({ service: 'Bhojanam API', status: 'scaffold', message: 'POS route migration is not complete yet.' }));
const server = app.listen(port, () => console.log(`Bhojanam API listening on port ${port}`));
async function shutdown() { server.close(async () => { if (pool) await pool.end(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
