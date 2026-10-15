import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pool } from './config/db.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
const app = express();
const port = Number(process.env.PORT || 5000);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);
const server = app.listen(port, () => console.log(`Bhojanam API listening on port ${port}`));
async function shutdown() {
  server.close(async () => { if (pool) await pool.end(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
