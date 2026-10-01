import { HttpError } from '../utils/errors.js';

export class PostgresOfferStore {
  constructor(pool) { this.pool = pool; }
  // The video_id column mirrors document->>'video_id' so discovery and the
  // creator library can join without scanning the offers jsonb. Keeping it
  // derived from the document means the two can never disagree.
  static videoId(document) { return document?.video_id ?? null; }
  async getOffer(id) {
    return (await this.pool.query('SELECT document FROM offers WHERE id = $1', [id])).rows[0]?.document;
  }
  async getOfferEvent(id, eventId) {
    return (await this.pool.query('SELECT event FROM nostr_outbox WHERE offer_id = $1 AND event_id = $2', [id, eventId])).rows[0]?.event;
  }
  async saveOfferDocument(document) {
    const id = document.offerId || document.id;
    if (!id) throw new Error('Offer document must include offerId or id');
    await this.pool.query(
      'INSERT INTO offers(id, document, video_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, video_id = EXCLUDED.video_id',
      [id, document, PostgresOfferStore.videoId(document)]
    );
    return document;
  }
  async queueLicense(offer, event) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`license:${offer.id}`]);
      const current = (await client.query('SELECT document FROM offers WHERE id = $1 FOR UPDATE', [offer.id])).rows[0]?.document;
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      if (current.license_event_id) { await client.query('COMMIT'); return current; }
      const next = { ...current, status: 'licensing', license_event_id: event.id, licensed_at: offer.payment.settled_at };
      await client.query('INSERT INTO nostr_outbox(event_id, offer_id, event) VALUES ($1, $2, $3)', [event.id, offer.id, event]);
      await client.query('UPDATE offers SET document = $2 WHERE id = $1', [offer.id, next]);
      await client.query('COMMIT');
      return next;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async saveLightningWebhook(entry) {
    await this.pool.query(
      `INSERT INTO lightning_webhooks(id, provider, event_type, payment_hash, offer_id, payload, headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.id, entry.provider, entry.eventType ?? null, entry.paymentHash ?? null, entry.offerId ?? null, entry.payload, entry.headers]
    );
    return entry;
  }
  async idempotent(scope, digest, work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scope]);
      const previous = (await client.query('SELECT digest, response FROM api_requests WHERE scope = $1', [scope])).rows[0];
      if (previous) {
        if (previous.digest !== digest) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This key was already used for a different request body.');
        await client.query('COMMIT');
        return previous.response;
      }
      const response = await work({
        insertOffer: offer => client.query('INSERT INTO offers(id, document, video_id) VALUES ($1, $2, $3)',
          [offer.id, offer, PostgresOfferStore.videoId(offer)]),
        getOfferForUpdate: async id => (await client.query('SELECT document FROM offers WHERE id = $1 FOR UPDATE', [id])).rows[0]?.document,
        insertVideo: video => client.query('INSERT INTO videos(id, owner_public_key, document) VALUES ($1, $2, $3)',
          [video.id, video.owner_public_key, video]),
        issueUploadSession: session => client.query('INSERT INTO upload_sessions(id, owner_public_key, expires_at) VALUES ($1, $2, to_timestamp($3::double precision))',
          [session.id, session.owner_public_key, session.expires_at]),
        // Single use and owner scoped: consuming the session in the same
        // transaction as the insert keeps registration atomic.
        consumeUploadSession: (id, owner, now) => client
          .query('DELETE FROM upload_sessions WHERE id = $1 AND owner_public_key = $2 AND expires_at > to_timestamp($3::double precision) RETURNING id',
            [id, owner, now])
          .then(result => result.rowCount === 1),
        queueOffer: async (offer, event) => {
          await client.query('INSERT INTO nostr_outbox(event_id, offer_id, event) VALUES ($1, $2, $3)', [event.id, offer.id, event]);
          await client.query('UPDATE offers SET document = $2, event_id = $3, video_id = $4 WHERE id = $1',
            [offer.id, offer, event.id, PostgresOfferStore.videoId(offer)]);
        }
      });
      await client.query('INSERT INTO api_requests(scope, digest, response) VALUES ($1, $2, $3)', [scope, digest, response]);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new HttpError(409, 'EVENT_ALREADY_USED', 'This signed event is already assigned to an offer.');
      throw error;
    } finally { client.release(); }
  }
  async publishNext(publish) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const item = (await client.query(`SELECT * FROM nostr_outbox WHERE published_at IS NULL
        AND next_attempt_at <= now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!item) { await client.query('COMMIT'); return false; }
      let relay;
      try { relay = await publish(item.event); } catch (error) {
        const delay = Math.min(300, 2 ** Math.min(item.attempts + 1, 9));
        await client.query(`UPDATE nostr_outbox SET attempts = attempts + 1, last_error = $2,
          next_attempt_at = now() + ($3 * interval '1 second') WHERE event_id = $1`,
        [item.event_id, String(error.message).slice(0, 500), delay]);
        await client.query('COMMIT');
        return true;
      }
      await client.query(`UPDATE nostr_outbox SET published_at = now(), acknowledged_relay = $2,
        attempts = attempts + 1, last_error = NULL WHERE event_id = $1`, [item.event_id, relay]);
      await client.query(`UPDATE offers SET document = CASE
        WHEN document->>'status' = 'publishing' THEN jsonb_set(document, '{status}', '"published"'::jsonb)
        WHEN document->>'status' = 'licensing' THEN jsonb_set(document, '{status}', '"licensed"'::jsonb)
        ELSE document END WHERE id = $1`, [item.offer_id]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
