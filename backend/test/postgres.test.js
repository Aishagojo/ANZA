import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgresOfferStore } from '../src/repositories/offers.js';

test('PostgreSQL transactions, idempotency, outbox retry and acknowledgement', async t => {
  if (!process.env.TEST_DATABASE_URL) { t.skip('Set TEST_DATABASE_URL to a disposable PostgreSQL database'); return; }
  const { default: pg } = await import('pg');
  const schema = 'cp_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  try {
    await pool.query(await readFile(new URL('../src/database/migrations/001_offers.sql', import.meta.url), 'utf8'));
    const store = new PostgresOfferStore(pool);
    const offer = { id: 'offer_test', creator_pubkey: 'a'.repeat(64), terms: {}, status: 'draft', event_id: null, created_at: 1000 };
    const work = async tx => { await tx.insertOffer(offer); return { status: 201, body: offer }; };
    const results = await Promise.all([store.idempotent('create', 'digest', work), store.idempotent('create', 'digest', work)]);
    assert.deepEqual(results[0], results[1]);
    await assert.rejects(store.idempotent('create', 'different', work), { status: 409 });
    const signed = { id: 'b'.repeat(64), content: 'signed content preserved' };
    await store.idempotent('publish', 'digest', async tx => {
      const previous = await tx.getOfferForUpdate(offer.id);
      await tx.queueOffer({ ...previous, event_id: signed.id, status: 'publishing' }, signed);
      return { status: 202, body: previous };
    });
    await store.publishNext(async actual => { assert.deepEqual(actual, signed); throw new Error('relay offline'); });
    assert.equal((await store.getOffer(offer.id)).status, 'publishing');
    assert.equal((await pool.query('SELECT attempts FROM nostr_outbox')).rows[0].attempts, 1);
    await pool.query('UPDATE nostr_outbox SET next_attempt_at = now()');
    await store.publishNext(async actual => { assert.deepEqual(actual, signed); return 'wss://relay.example'; });
    assert.equal((await store.getOffer(offer.id)).status, 'published');
    assert.equal(await store.publishNext(() => assert.fail('Already published')), false);
    const restarted = new PostgresOfferStore(pool);
    assert.equal((await restarted.getOffer(offer.id)).status, 'published');
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
