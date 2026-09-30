import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const migrationsUrl = new URL('../src/database/migrations/', import.meta.url);

try {
  // Applied names are recorded so re-running is a no-op and a new file is
  // picked up without editing this script. Each migration is also written to
  // be idempotent, which keeps an already-provisioned database recoverable.
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
  const files = (await readdir(migrationsUrl)).filter(name => name.endsWith('.sql')).sort();

  if (!files.length) throw new Error(`No .sql migrations found in ${migrationsUrl.pathname}`);

  for (const name of files) {
    if (applied.has(name)) {
      console.log(`skip   ${name} (already applied)`);
      continue;
    }
    // Each file is wrapped in its own transaction so a failure leaves the
    // schema_migrations record untouched and the migration is retried whole.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(new URL(name, migrationsUrl), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`apply  ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${error.message}`);
    } finally {
      client.release();
    }
  }

  console.log('Migrations up to date.');
} finally {
  await pool.end();
}
