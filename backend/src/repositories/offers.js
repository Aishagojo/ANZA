import { HttpError } from '../utils/errors.js';

export class PostgresOfferStore {
  constructor(pool) { this.pool = pool; }
  async getOffer(id) {
    return (await this.pool.query('SELECT document FROM offers WHERE id = $1', [id])).rows[0]?.document;
  }
  async getOfferEvent(id) {
    return (await this.pool.query(
      "SELECT event FROM nostr_outbox WHERE offer_id = $1 AND event_role = 'offer'", [id])).rows[0]?.event;
  }
  // Whole-document upsert, for paths that cannot race the publication worker.
  async saveOfferDocument(document) {
    const id = document.offerId || document.id;
    if (!id) throw new Error('Offer document must include offerId or id');
    await this.pool.query(
      'INSERT INTO offers(id, document) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document',
      [id, document]
    );
    return document;
  }
  // Settlement and invoice writes touch only {payment}, so a concurrent
  // publication worker updating {status} is never clobbered.
  async savePaymentState(id, payment) {
    await this.pool.query(
      'UPDATE offers SET document = jsonb_set(document, \'{payment}\', $2::jsonb) WHERE id = $1',
      [id, JSON.stringify(payment)]
    );
  }
  async getLicense(offerId) {
    return (await this.pool.query('SELECT * FROM licenses WHERE offer_id = $1', [offerId])).rows[0] || null;
  }
  async createLicense({ id, offerId, paymentId, startsAt, endsAt }) {
    await this.pool.query(
      `INSERT INTO licenses(id, offer_id, payment_id, starts_at, ends_at, publication_status)
       VALUES ($1, $2, $3, $4, $5, 'pending') ON CONFLICT (offer_id) DO NOTHING`,
      [id, offerId, paymentId, startsAt, endsAt]
    );
  }
  async queueLicenseEvent({ eventId, offerId, licenseId, event }) {
    await this.pool.query(
      `INSERT INTO nostr_outbox(event_id, offer_id, event_role, license_id, event)
       VALUES ($1, $2, 'license', $3, $4) ON CONFLICT (event_id) DO NOTHING`,
      [eventId, offerId, licenseId, event]
    );
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
    console.log('[PUBLISHER] publishNext tick');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const item = (await client.query(`SELECT * FROM nostr_outbox WHERE published_at IS NULL
        AND next_attempt_at <= now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!item) { 
        console.log('[PUBLISHER] No events to publish');
        await client.query('COMMIT'); 
        return false; 
      }
      console.log('[PUBLISHER] Found event to publish', { eventId: item.event_id, offerId: item.offer_id, eventRole: item.event_role, attempts: item.attempts });
      let relay;
      try { 
        console.log('[PUBLISHER] Publishing event to relay', { eventId: item.event_id });
        relay = await publish(item.event); 
        console.log('[PUBLISHER] Event published successfully', { eventId: item.event_id, relay });
      } catch (error) {
        console.error('[PUBLISHER] Failed to publish event', { eventId: item.event_id, error: error.message });
        const delay = Math.min(300, 2 ** Math.min(item.attempts + 1, 9));
        await client.query(`UPDATE nostr_outbox SET attempts = attempts + 1, last_error = $2,
          next_attempt_at = now() + ($3 * interval '1 second') WHERE event_id = $1`,
        [item.event_id, String(error.message).slice(0, 500), delay]);
        await client.query('COMMIT');
        return true;
      }
      await client.query(`UPDATE nostr_outbox SET published_at = now(), acknowledged_relay = $2,
        attempts = attempts + 1, last_error = NULL WHERE event_id = $1`, [item.event_id, relay]);
      if (item.event_role === 'license') {
        await client.query(
          "UPDATE licenses SET publication_status = 'published', event_id = $2 WHERE id = $1",
          [item.license_id, item.event_id]);
        // The offer only becomes licensed once the relay accepted the event, and
        // only while settlement is still recorded as settled.
        await client.query(
          `UPDATE offers SET document = jsonb_set(document, '{status}', '"licensed"'::jsonb)
           WHERE id = $1 AND document->>'status' = 'published'
             AND document->'payment'->>'status' = 'settled'`, [item.offer_id]);
      } else {
        await client.query(
          `UPDATE offers SET document = jsonb_set(document, '{status}', '"published"'::jsonb)
           WHERE id = $1 AND document->>'status' = 'publishing'`, [item.offer_id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
