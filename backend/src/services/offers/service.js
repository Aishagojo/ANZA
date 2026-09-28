import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validate } from '../../validators/validation.js';
import { buildOfferEvent } from '../nostr/events.js';
import { HttpError } from '../../utils/errors.js';

export function createOfferService({ store, verifyEvent, kind, attestorPubkey, now = () => Math.floor(Date.now() / 1000) }) {
  const input = (schema, body) => {
    try { validate(schema, body); } catch (error) { throw new HttpError(400, 'VALIDATION_ERROR', error.message); }
  };
  const normalizeWebhook = body => {
    const payload = body && typeof body === 'object' ? body : {};
    const provider = String(payload.provider || payload.source || 'lightning');
    const eventType = String(payload.eventType || payload.type || payload.event_type || 'payment.received');
    const paymentHash = String(payload.payment_hash || payload.paymentHash || payload.hash || '');
    const offerId = String(payload.offerId || payload.offer_id || payload.reference || payload.metadata?.offerId || payload.metadata?.offer_id || '');
    return { provider, eventType, paymentHash, offerId, payload };
  };
  return {
    async create({ pubkey, body, key, digest }) {
      input('Terms', body);
      try {
        const url = new URL(body.content_url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch { throw new HttpError(400, 'VALIDATION_ERROR', 'Content URL must be a valid public HTTPS reference.'); }
      return store.idempotent(`${pubkey}:POST:/offers:${key}`, digest, async tx => {
        const offer = { id: randomUUID(), creator_pubkey: pubkey, terms: body, status: 'draft', event_id: null, created_at: now() };
        await tx.insertOffer(offer);
        return { status: 201, body: offer };
      });
    },
    async get(id, pubkey) {
      const stored = await store.getOffer(id);
      if (!stored) {
        throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      }
      if (stored.offerId) return { status: 200, body: stored };
      if (!['published', 'licensed'].includes(stored.status) && stored.creator_pubkey !== pubkey) {
        throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      }
      return { status: 200, body: stored };
    },
    async publish({ id, pubkey, body, key, digest }) {
      input('SignedEvent', body);
      let valid = false;
      try { valid = verifyEvent(body); } catch { /* Invalid cryptographic input. */ }
      if (!valid) throw new HttpError(400, 'INVALID_EVENT', 'Invalid event ID or signature.');
      return store.idempotent(`${pubkey}:POST:/offers/${id}/publish:${key}`, digest, async tx => {
        const offer = await tx.getOfferForUpdate(id);
        if (!offer) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
        if (offer.creator_pubkey !== pubkey) throw new HttpError(403, 'FORBIDDEN', 'Only the creator can publish this offer.');
        if (offer.event_id) {
          if (offer.event_id !== body.id) throw new HttpError(409, 'OFFER_IMMUTABLE', 'An event is already assigned to this offer.');
          return { status: 202, body: offer };
        }
        const expected = buildOfferEvent({ kind, creatorPubkey: pubkey, attestorPubkey, terms: offer.terms, createdAt: body.created_at });
        let payload;
        try { payload = JSON.parse(body.content); } catch { throw new HttpError(400, 'INVALID_EVENT', 'Event content must contain JSON.'); }
        if (body.pubkey !== pubkey || body.kind !== kind || Math.abs(now() - body.created_at) > 300 ||
            !isDeepStrictEqual(body.tags, expected.tags) || !isDeepStrictEqual(payload, JSON.parse(expected.content))) {
          throw new HttpError(400, 'INVALID_EVENT', 'Event must match the creator, configured kind, draft terms, tags, attestor, and timestamp policy.');
        }
        const next = { ...offer, status: 'publishing', event_id: body.id };
        await tx.queueOffer(next, body);
        return { status: 202, body: next };
      });
    },
    async createPayment() {
      throw new HttpError(501, 'PAYMENT_NOT_CONFIGURED', 'Lightning payment integration is not configured yet.');
    },
    async getStatus() {
      throw new HttpError(501, 'PAYMENT_NOT_CONFIGURED', 'Lightning payment integration is not configured yet.');
    },
    async lightningWebhook({ body, headers }) {
      if (!body || typeof body !== 'object') throw new HttpError(400, 'VALIDATION_ERROR', 'Webhook payload must be JSON.');
      const normalized = normalizeWebhook(body);
      const entry = {
        id: randomUUID(),
        provider: normalized.provider,
        eventType: normalized.eventType,
        paymentHash: normalized.paymentHash || null,
        offerId: normalized.offerId || null,
        payload: body,
        headers
      };
      await store.saveLightningWebhook(entry);
      return {
        status: 202,
        body: { received: true, provider: entry.provider, eventType: entry.eventType, offerId: entry.offerId || null }
      };
    }
  };
}
