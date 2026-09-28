import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, buildOfferEvent, buildLicenseEvent, contract } from '../index.js';

const creator = 'a'.repeat(64);
const attestor = 'b'.repeat(64);
const terms = {
  brand: 'Example Brand Kenya', content_url: 'https://example.com/preview.mp4',
  content_sha256: 'c'.repeat(64), amount_sats: 25000,
  usage_rights: 'Organic Instagram use only; no paid advertising.',
  duration: { type: 'fixed', days: 30 }
};
// Structural fixtures only. These IDs/signatures are deliberately not cryptographic proofs.
const offer = () => ({
  ...buildOfferEvent({ kind: 9998, creatorPubkey: creator, attestorPubkey: attestor, terms, createdAt: 1000 }),
  id: 'd'.repeat(64), sig: 'e'.repeat(128)
});
const settlement = { offer_event_id: 'd'.repeat(64), payment_hash: 'f'.repeat(64), amount_sats: 25000, settled_at: 2000 };
const license = (overrides = {}) => buildLicenseEvent({ kind: 9999, attestorPubkey: attestor, offerEvent: offer(), settlement, ...overrides });

test('terms support fixed and perpetual durations', () => {
  assert.equal(validate('Terms', terms), terms);
  validate('Terms', { ...terms, duration: { type: 'perpetual' } });
});
test('reject invalid prices, missing fields, private-key injection, and contradictory duration', () => {
  for (const amount_sats of [0, -1, 1.5, '25000', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validate('Terms', { ...terms, amount_sats }), TypeError);
  }
  assert.throws(() => validate('Terms', { ...terms, brand: '   ' }));
  assert.throws(() => validate('Terms', { ...terms, content_sha256: undefined }));
  assert.throws(() => validate('Terms', { ...terms, private_key: 'secret' }));
  for (const duration of [{ type: 'fixed', days: 0 }, { type: 'perpetual', days: 30 }, { type: 'fixed' }]) {
    assert.throws(() => validate('Terms', { ...terms, duration }));
  }
});
test('offer template preserves terms and has no fabricated signature', () => {
  const template = buildOfferEvent({ kind: 9998, creatorPubkey: creator, attestorPubkey: attestor, terms, createdAt: 1000 });
  assert.deepEqual(JSON.parse(template.content), { schema: 'contentport.offer.v1', terms, attestor_pubkey: attestor });
  assert.equal(template.sig, undefined);
  assert.equal(template.id, undefined);
  assert.equal(template.pubkey, creator);
});
test('fixed license references original event and computes expiry from settlement', () => {
  const result = license();
  const payload = JSON.parse(result.content);
  assert.equal(payload.starts_at, 2000);
  assert.equal(payload.ends_at, 2000 + 30 * 86400);
  assert.equal(payload.offer_event_id, offer().id);
  assert.deepEqual(result.tags[0], ['e', offer().id]);
  assert.equal(result.pubkey, attestor);
  assert.equal(payload.evidence_type, 'contentport-settlement-attestation');
  assert.equal(payload.invoice, undefined);
});
test('perpetual license has no expiry', () => {
  const event = offer();
  const content = JSON.parse(event.content);
  content.terms.duration = { type: 'perpetual' };
  event.content = JSON.stringify(content);
  assert.equal(JSON.parse(license({ offerEvent: event }).content).ends_at, null);
});
test('reject a different offer, amount, attestor, or impossible settlement time', () => {
  assert.throws(() => license({ settlement: { ...settlement, offer_event_id: '0'.repeat(64) } }), /reference mismatch/);
  assert.throws(() => license({ settlement: { ...settlement, amount_sats: 1 } }), /amount mismatch/);
  assert.throws(() => license({ settlement: { ...settlement, settled_at: 999 } }), /predates/);
  assert.throws(() => license({ attestorPubkey: creator }), /Unauthorized/);
});
test('reject unknown versions, invalid keys, timestamps, and non-regular kind configuration', () => {
  const event = offer();
  event.content = JSON.stringify({ ...JSON.parse(event.content), schema: 'unknown' });
  assert.throws(() => license({ offerEvent: event }), /Unsupported/);
  for (const kind of [undefined, 10000, 20000, 30078, -1, 1.5]) {
    assert.throws(() => license({ kind }), /regular event kind/);
  }
  assert.throws(() => buildOfferEvent({ kind: 9998, creatorPubkey: 'invalid', attestorPubkey: attestor, terms, createdAt: 1 }));
  assert.throws(() => license({ settlement: { ...settlement, settled_at: Number.MAX_SAFE_INTEGER } }));
});
test('payment settlement and license publication can be represented independently', () => {
  validate('PaymentStatus', {
    payment: { id: 'pay_1', offer_id: 'offer_1', offer_event_id: offer().id,
      amount_sats: 25000, payment_hash: settlement.payment_hash, invoice: 'illustrative-invoice',
      expires_at: 2100, status: 'settled', settled_at: 2000 },
    license: { id: 'license_1', offer_id: 'offer_1', offer_event_id: offer().id,
      payment_id: 'pay_1', starts_at: 2000, ends_at: 2594000, publication_status: 'pending', event_id: null }
  });
});
test('exported API contract matches source and all schema references resolve', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url))), contract);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) assert.ok(contract.components.schemas[value.$ref.split('/').at(-1)], value.$ref);
    Object.values(value).forEach(visit);
  };
  visit(contract);
});
