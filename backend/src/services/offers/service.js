import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validate } from '../../validators/validation.js';
import { buildOfferEvent } from '../nostr/events.js';
import { HttpError } from '../../utils/errors.js';
import { verifySpeedWebhook } from '../payments/speed.js';

export function createOfferService({ store, verifyEvent, kind, attestorPubkey, speedWebhookSecret, paymentProvider = null, now = () => Math.floor(Date.now() / 1000) }) {
  const input = (schema, body) => {
    try { validate(schema, body); } catch (error) { throw new HttpError(400, 'VALIDATION_ERROR', error.message); }
  };
  const normalizeWebhook = body => {
    const payload = body && typeof body === 'object' ? body : {};
    const payment = payload.data?.object && typeof payload.data.object === 'object' ? payload.data.object : payload;
    const reference = String(payment.metadata?.offer_id || payment.metadata?.offerId || payment.offer_id || '');
    const offerId = reference.startsWith('contentport_') ? reference.slice('contentport_'.length) : reference;
    return {
      provider: 'speed', eventType: String(payload.event_type || 'unknown'),
      paymentHash: String(payment.payment_method_options?.lightning?.id || payment.id || ''),
      offerId, payload
    };
  };
  const invoiceHasExpired = payment => {
    if (!payment?.expires_at) return false;
    const expiry = typeof payment.expires_at === 'number'
      ? payment.expires_at
      : Math.floor(Date.parse(payment.expires_at) / 1000);
    return Number.isFinite(expiry) && expiry <= now();
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
      if (!stored) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      if (stored.offerId) return { status: 200, body: stored };
      if (!['published', 'licensed'].includes(stored.status) && stored.creator_pubkey !== pubkey) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
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
    async createPayment(id) {
      if (!paymentProvider) throw new HttpError(501, 'PAYMENT_NOT_CONFIGURED', "Polar LND is not configured. Add the Creator node's LND_REST_URL and LND_MACAROON to backend/.env.");
      const offer = await store.getOffer(id);
      if (!offer || !['published', 'licensed'].includes(offer.status)) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      if (offer.status === 'licensed') throw new HttpError(409, 'OFFER_ALREADY_LICENSED', 'This offer has already been licensed.');
      if (offer.payment?.status === 'settled' || (offer.payment?.status === 'pending' && !invoiceHasExpired(offer.payment))) {
        return { status: 200, body: { offerId: offer.id, amountSats: offer.payment.amount_sats, paymentRequest: offer.payment.request } };
      }
      const invoice = await paymentProvider.createInvoice({
        amountSats: offer.terms.amount_sats,
        description: `ContentPort license: ${offer.terms.title || offer.id}`,
        expiry: 3600,
        reference: `contentport_${offer.id}`
      });
      if (!invoice?.id || !String(invoice.payment_hash || '') || !/^ln/i.test(String(invoice.request || '')) ||
          Number(invoice.amount_sat) !== offer.terms.amount_sats || invoice.status !== 'pending') {
        throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'Polar LND returned an invalid Lightning invoice.');
      }
      const next = { ...offer, payment: {
        provider: paymentProvider.name || 'polar-lnd', invoice_id: invoice.id, payment_hash: String(invoice.payment_hash),
        request: invoice.request, amount_sats: offer.terms.amount_sats, status: 'pending',
        reference: `contentport_${offer.id}`, expires_at: invoice.expires_at
      } };
      await store.saveOfferDocument(next);
      return { status: 201, body: { offerId: offer.id, amountSats: offer.terms.amount_sats, paymentRequest: invoice.request } };
    },
    async getStatus(id) {
      let offer = await store.getOffer(id);
      if (!offer || !['published', 'licensed'].includes(offer.status)) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      if (offer.payment?.status === 'pending' && paymentProvider?.lookupInvoice) {
        try {
          const invoice = await paymentProvider.lookupInvoice(offer.payment.payment_hash);
          if (invoice.status === 'settled') {
            offer = { ...offer, payment: { ...offer.payment, status: 'settled', settled_at: invoice.settled_at ?? now() } };
            await store.saveOfferDocument(offer);
          }
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 503) throw error;
        }
      }
      return { status: 200, body: {
        offerId: offer.id,
        status: offer.status === 'licensed' ? 'LICENSED' : offer.payment?.status === 'settled' ? 'PAYMENT_SETTLED' : offer.payment?.status === 'pending' ? 'PAYMENT_PENDING' : 'OPEN',
        ...(offer.payment?.settled_at ? { paymentSettledAt: offer.payment.settled_at } : {}),
        ...(offer.licensed_at ? { licensedAt: offer.licensed_at } : {}),
        ...(offer.license_event_id ? { licenseNostrEventId: offer.license_event_id } : {})
      } };
    },
    async lightningWebhook({ body, headers, rawBody, provider = 'speed' }) {
      if (!body || typeof body !== 'object') throw new HttpError(400, 'VALIDATION_ERROR', 'Webhook payload must be JSON.');
      if (provider !== 'speed') throw new HttpError(501, 'PROVIDER_NOT_SUPPORTED', 'This webhook provider is not supported.');
      verifySpeedWebhook({ rawBody, headers, secret: speedWebhookSecret });
      const normalized = normalizeWebhook(body);
      const entry = { id: randomUUID(), provider: normalized.provider, eventType: normalized.eventType,
        paymentHash: normalized.paymentHash || null, offerId: normalized.offerId || null, payload: body, headers };
      await store.saveLightningWebhook(entry);
      return { status: 200, body: { received: true, provider: entry.provider, eventType: entry.eventType, offerId: entry.offerId || null } };
    }
  };
}
