import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgresOfferStore } from '../src/repositories/offers.js';

import { PostgresContentStore } from '../src/repositories/videos.js';

async function withSchema(run) {
  const schema = 'cp_test_' + randomUUID().replaceAll('-', '');
  const admin = new pgModule.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pgModule.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  try {
    for (const migration of ['001_offers.sql', '002_videos.sql']) {
      await pool.query(await readFile(new URL(`../src/database/migrations/${migration}`, import.meta.url), 'utf8'));
    }
    await run(pool, schema);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

let pgModule;
test('PostgreSQL transactions, idempotency, outbox retry and acknowledgement', async t => {
  if (!process.env.TEST_DATABASE_URL) { t.skip('Set TEST_DATABASE_URL to a disposable PostgreSQL database'); return; }
  const { default: pg } = await import('pg');
  pgModule = pg;
  await withSchema(async pool => {
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
  });
});

test('content layer persists ownership in the database and filters discovery by offer state', async t => {
  if (!process.env.TEST_DATABASE_URL) { t.skip('Set TEST_DATABASE_URL to a disposable PostgreSQL database'); return; }
  if (!pgModule) { const { default: pg } = await import('pg'); pgModule = pg; }
  await withSchema(async pool => {
    const store = new PostgresContentStore(pool);
    const owner = 'a'.repeat(64);
    const stranger = 'd'.repeat(64);
    const video = {
      id: 'video_1', owner_public_key: owner, title: 'Mountain view', cloud_name: 'demo',
      public_id: 'contentport/videos/abc', asset_version: 7, resource_type: 'video', format: 'mp4',
      status: 'ready', reference_sha256: 'e'.repeat(64), original_sha256: null, bytes: 4096,
      duration_seconds: 45, width: 1920, height: 1080, upload_session_id: 's'.repeat(32),
      created_at: 1000, updated_at: 1000
    };
    const register = async session => store.idempotent(`reg-${session}`, 'digest', async tx => {
      const consumed = await tx.consumeUploadSession(session, owner, 1000);
      if (!consumed) throw Object.assign(new Error('expired'), { status: 403 });
      await tx.insertVideo(video);
      return { status: 201, body: video };
    });

    // The upload session is single use, so the second attempt cannot register again.
    await store.idempotent('issue', 'digest', tx => tx.issueUploadSession({ id: 's'.repeat(32), owner_public_key: owner, expires_at: 5000 }));
    assert.equal((await register('s'.repeat(32))).status, 201);
    assert.equal((await register('s'.repeat(32))).status, 201, 'idempotent replay');
    await store.idempotent('issue2', 'digest', tx => tx.issueUploadSession({ id: 't'.repeat(32), owner_public_key: owner, expires_at: 500 }));
    await assert.rejects(register('t'.repeat(32)), { status: 403 }, 'expired session');

    // Ownership is decided by the query, not by the caller.
    assert.equal((await store.getOwnedVideo(video.id, owner)).id, video.id);
    assert.equal(await store.getOwnedVideo(video.id, stranger), undefined);
    assert.equal(await store.deleteOwnedVideo(video.id, stranger), 0);
    assert.deepEqual((await store.listVideosByOwner(stranger)), []);

    // The mirrored video_id column is written with the offer.
    const terms = { brand: 'Acme', content_url: 'https://res.cloudinary.com/demo/video/upload/x.mp4', content_sha256: 'c'.repeat(64),
      amount_sats: 5000, usage_rights: 'Social use', duration: { type: 'fixed', days: 30 } };
    const draft = { id: 'offer_1', creator_pubkey: owner, terms, status: 'draft', event_id: null, video_id: video.id, created_at: 2000 };
    await store.idempotent('offer', 'digest', tx => tx.insertOffer(draft));
    assert.equal((await pool.query('SELECT video_id FROM offers WHERE id = $1', ['offer_1'])).rows[0].video_id, video.id);
    assert.deepEqual(await store.listOffersForVideo(video.id),
      [{ video_id: 'video_1', id: 'offer_1', status: 'draft', amount_sats: 5000, created_at: 2000 }]);

    // Only published and licensing offers are discoverable.
    await pool.query('UPDATE offers SET document = jsonb_set(document, \'{status}\', \'"published"\') WHERE id = $1', ['offer_1']);
    const listed = await store.listDiscoverableOffers(50);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].offer.id, 'offer_1');
    assert.equal(listed[0].video.id, video.id);
    await pool.query('UPDATE offers SET document = jsonb_set(document, \'{status}\', \'"licensed"\') WHERE id = $1', ['offer_1']);
    assert.deepEqual(await store.listDiscoverableOffers(50), []);
    await pool.query('UPDATE offers SET document = jsonb_set(document, \'{status}\', \'"licensing"\') WHERE id = $1', ['offer_1']);
    assert.equal((await store.listDiscoverableOffers(50)).length, 1);

    // A creator's own library and its offer relationship.
    assert.equal((await store.listVideosByOwner(owner)).length, 1);
    assert.deepEqual(await store.listOffersForOwner(stranger), []);
    assert.equal((await store.listOffersForOwner(owner)).length, 1);
    // The foreign key is a database-level backstop behind the service check that
    // refuses to delete a referenced video.
    await assert.rejects(store.deleteOwnedVideo(video.id, owner), { code: '23503' });
    await pool.query('DELETE FROM offers WHERE id = $1', ['offer_1']);
    assert.equal(await store.deleteOwnedVideo(video.id, owner), 1);
    assert.equal(await store.getVideo(video.id), undefined);
  });
});
