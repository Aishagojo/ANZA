import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validate } from '../../validators/validation.js';
import { buildOfferEvent, buildLicenseEvent } from '../nostr/events.js';
import { HttpError } from '../../utils/errors.js';
import { verifySpeedWebhook } from '../payments/speed.js';

export function createOfferService({
  store, verifyEvent, kind, attestorPubkey, licenseKind = null, attestorSecretKey = null,
  speedWebhookSecret = null, paymentProvider = null, signEvent = null,
  now = () => Math.floor(Date.now() / 1000)
}) {
  const input = (schema, body) => {
    try { validate(schema, body); } catch (error) { throw new HttpError(400, 'VALIDATION_ERROR', error.message); }
  };
  // A license needs a configured kind, the attestor key, and a signer. Without
  // all three the offer stays settled but unlicensed rather than publishing a
  // signature we cannot produce.
  const canIssueLicense = Boolean(licenseKind && attestorSecretKey && signEvent);
  const issueLicense = async offer => {
    if (!canIssueLicense) return null;
    // Checked before building or signing: the status endpoint is polled
    // repeatedly, and re-signing each time would queue a duplicate license.
    const existing = await store.getLicense(offer.id);
    if (existing) return existing;
    const offerEvent = await store.getOfferEvent(offer.id);
    if (!offerEvent) return null;
    const settlement = {
      offer_event_id: offerEvent.id,
      payment_hash: offer.payment.payment_hash,
      amount_sats: offer.payment.amount_sats,
      settled_at: offer.payment.settled_at
    };
    let template;
    try {
      // buildLicenseEvent re-checks amount, attestor and timestamp against the
      // offer that is actually on the relay, so a settlement that does not match
      // the published terms is refused here rather than attested.
      template = buildLicenseEvent({ kind: licenseKind, attestorPubkey, offerEvent, settlement });
    } catch (error) {
      throw new HttpError(500, 'LICENSE_BUILD_FAILED', `Settlement did not match the published offer: ${error.message}`);
    }
    const event = await signEvent(template, attestorSecretKey);
    const license = { id: randomUUID(), offerId: offer.id, paymentId: randomUUID(),
      startsAt: settlement.settled_at, endsAt: JSON.parse(template.content).ends_at };
    await store.createLicense({ id: license.id, offerId: offer.id, paymentId: license.paymentId,
      startsAt: license.startsAt, endsAt: license.endsAt });
    await store.queueLicenseEvent({ eventId: event.id, offerId: offer.id, licenseId: license.id, event });
    return license;
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
      const next = { provider: paymentProvider.name || 'polar-lnd', invoice_id: invoice.id,
        payment_hash: String(invoice.payment_hash), request: invoice.request,
        amount_sats: offer.terms.amount_sats, status: 'pending',
        reference: `contentport_${offer.id}`, expires_at: invoice.expires_at };
      await store.savePaymentState(id, next);
      return { status: 201, body: { offerId: offer.id, amountSats: offer.terms.amount_sats, paymentRequest: invoice.request } };
    },
    async getStatus(id) {
      let offer = await store.getOffer(id);
      if (!offer || !['published', 'licensed'].includes(offer.status)) throw new HttpError(404, 'NOT_FOUND', 'Offer not found.');
      if (offer.payment?.status === 'pending' && paymentProvider?.lookupInvoice) {
        try {
          const invoice = await paymentProvider.lookupInvoice(offer.payment.payment_hash);
          if (invoice.status === 'settled') {
            const settledAt = invoice.settled_at ?? now();
            // Targeted merge of {payment} only. The publication worker writes
            // {status} with a jsonb_set on the same row, and a whole-document
            // save here would roll the offer back to "publishing" if it landed
            // in between.
            await store.savePaymentState(id, { ...offer.payment, status: 'settled', settled_at: settledAt });
            offer = { ...offer, payment: { ...offer.payment, status: 'settled', settled_at: settledAt } };
          }
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 503) throw error;
        }
      }
      // A settled offer that is not yet licensed still needs its license event
      // built, signed and queued. Running on every poll means a transient signer
      // or database failure retries without extra machinery.
      if (offer.payment?.status === 'settled' && offer.status !== 'licensed') {
        await issueLicense(offer);
      }
      const license = offer.status === 'licensed' ? await store.getLicense(offer.id) : null;
      return { status: 200, body: {
        offerId: offer.id,
        status: offer.status === 'licensed' ? 'LICENSED' : offer.payment?.status === 'settled' ? 'PAYMENT_SETTLED' : offer.payment?.status === 'pending' ? 'PAYMENT_PENDING' : 'OPEN',
        ...(offer.payment?.settled_at ? { paymentSettledAt: offer.payment.settled_at } : {}),
        ...(license?.publication_status === 'published'
          ? { licensedAt: license.starts_at, licenseNostrEventId: license.event_id } : {})
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
