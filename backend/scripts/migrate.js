import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await pool.query(await readFile(new URL('../src/database/migrations/001_offers.sql', import.meta.url), 'utf8'));
  console.log('Offer tables created.');
} finally { await pool.end(); }
