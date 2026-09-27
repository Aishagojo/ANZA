import { HttpError } from '../utils/errors.js';

export class PostgresOfferStore {
  constructor(pool) { this.pool = pool; }
  async getOffer(id) {
    return (await this.pool.query('SELECT document FROM offers WHERE id = $1', [id])).rows[0]?.document;
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
        insertOffer: offer => client.query('INSERT INTO offers(id, document) VALUES ($1, $2)', [offer.id, offer]),
        getOfferForUpdate: async id => (await client.query('SELECT document FROM offers WHERE id = $1 FOR UPDATE', [id])).rows[0]?.document,
        queueOffer: async (offer, event) => {
          await client.query('INSERT INTO nostr_outbox(event_id, offer_id, event) VALUES ($1, $2, $3)', [event.id, offer.id, event]);
          await client.query('UPDATE offers SET document = $2, event_id = $3 WHERE id = $1', [offer.id, offer, event.id]);
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
      await client.query(`UPDATE offers SET document = jsonb_set(document, '{status}', '"published"'::jsonb)
        WHERE id = $1 AND document->>'status' = 'publishing'`, [item.offer_id]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
