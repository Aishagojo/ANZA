import { validate } from '../../validators/validation.js';

// Kind numbers are deployment configuration, not registered ContentPort kinds.
function envelope(kind, pubkey, createdAt, tags, payload) {
  if (!Number.isInteger(kind) || kind < 1000 || kind >= 10000) {
    throw new TypeError('Configure an experimental regular event kind in 1000..9999');
  }
  validate('hex', pubkey);
  validate('integer', createdAt);
  return { kind, pubkey, created_at: createdAt, tags, content: JSON.stringify(payload) };
}
export function buildOfferEvent({ kind, creatorPubkey, attestorPubkey, terms, createdAt }) {
  validate('Terms', terms);
  validate('hex', attestorPubkey);
  return envelope(kind, creatorPubkey, createdAt, [['t', 'contentport-offer-v1']], {
    schema: 'contentport.offer.v1', terms, attestor_pubkey: attestorPubkey
  });
}
// Inputs must already have passed signature and wallet settlement verification.
// This pure builder does not verify payment, sign events, or publish to relays.
export function buildLicenseEvent({ kind, attestorPubkey, offerEvent, settlement }) {
  validate('SignedEvent', offerEvent);
  validate('Settlement', settlement);
  const offer = JSON.parse(offerEvent.content);
  if (offer.schema !== 'contentport.offer.v1') throw new TypeError('Unsupported offer schema');
  validate('Terms', offer.terms);
  if (offer.attestor_pubkey !== attestorPubkey) throw new TypeError('Unauthorized attestor');
  if (settlement.offer_event_id !== offerEvent.id) throw new TypeError('Offer reference mismatch');
  if (settlement.amount_sats !== offer.terms.amount_sats) throw new TypeError('Payment amount mismatch');
  if (settlement.settled_at < offerEvent.created_at) throw new TypeError('Settlement predates offer');
  const endsAt = offer.terms.duration.type === 'perpetual' ? null
    : settlement.settled_at + offer.terms.duration.days * 86400;
  if (endsAt !== null) validate('integer', endsAt);
  return envelope(kind, attestorPubkey, settlement.settled_at,
    [['e', offerEvent.id], ['p', offerEvent.pubkey], ['t', 'contentport-license-v1']], {
      schema: 'contentport.license.v1', offer_event_id: offerEvent.id,
      payment_hash: settlement.payment_hash, amount_sats: settlement.amount_sats,
      starts_at: settlement.settled_at, ends_at: endsAt,
      evidence_type: 'contentport-settlement-attestation'
    });
}
