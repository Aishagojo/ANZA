import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  const directory = new URL('../src/database/migrations/', import.meta.url);
  const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await pool.query(await readFile(new URL(migration, directory), 'utf8'));
  console.log(`Applied ${migrations.length} migrations.`);
} finally { await pool.end(); }
