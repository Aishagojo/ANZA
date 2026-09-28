import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validators/validation.js';
import { buildOfferEvent } from '../src/services/nostr/events.js';
const key = 'a'.repeat(64);
const terms = { brand: 'Example', content_url: 'https://example.com/watermarked.mp4', content_sha256: key,
  amount_sats: 1000, usage_rights: 'Organic social use for 30 days', duration: { type: 'fixed', days: 30 } };
const listing = { id: 'offer_1', creator_pubkey: key, terms, status: 'draft', event_id: null,
  created_at: 1000, title: 'Product reel', description: 'A product demonstration', preview_image_url: 'https://example.com/preview.jpg' };
const asset = { id: 'asset_1', offer_id: 'offer_1', creator_pubkey: key, original_object_key: 'asset_original_1',
  original_sha256: key, mime_type: 'video/mp4', size_bytes: 100000, created_at: 1000 };
const grant = { id: 'grant_1', buyer_id: 'buyer_1', license_id: 'license_1', asset_id: 'asset_1', token_hash: key,
  created_at: 1000, expires_at: 2000, used_at: null, revoked_at: null };

test('media listing requires meaningful metadata and HTTPS preview URLs', () => {
  validate('MediaListing', listing);
  validate('MediaListing', { ...listing, status: 'published', event_id: key });
  for (const change of [{ title: '' }, { title: '  ' }, { description: undefined },
    { preview_image_url: 'https://user:password@example.com/private' }, { preview_image_url: 'https://' },
    { status: 'published' }, { terms: { ...terms, amount_sats: 1.5 } }]) {
    assert.throws(() => validate('MediaListing', { ...listing, ...change }));
  }
});
test('private originals use storage references with bounded media metadata', () => {
  validate('MediaAsset', asset);
  for (const change of [{ original_object_key: 'https://example.com/private.mp4' },
    { original_object_key: '../original' }, { size_bytes: 0 }, { mime_type: 'text/html' }, { original_sha256: 'invalid' }]) {
    assert.throws(() => validate('MediaAsset', { ...asset, ...change }));
  }
});
test('public schemas and Nostr offer builder reject private storage and token fields', () => {
  for (const privateField of [{ original_object_key: asset.original_object_key }, { token_hash: grant.token_hash },
    { wallet_connection_ref: 'wallet_1' }]) {
    assert.throws(() => validate('MediaListing', { ...listing, ...privateField }));
    assert.throws(() => buildOfferEvent({ kind: 9998, creatorPubkey: key, attestorPubkey: key,
      createdAt: 1000, terms: { ...terms, ...privateField } }));
  }
});
test('buyer acceptance binds identity and exact terms; paid orders require references', () => {
  const acceptance = { id: 'accept_1', buyer_id: 'buyer_1', offer_id: 'offer_1', offer_event_id: key,
    accepted: true, licensee_name: 'Example', accepted_at: 1000 };
  validate('AcceptanceRecord', acceptance);
  assert.throws(() => validate('AcceptanceRecord', { ...acceptance, accepted: false }));
  assert.throws(() => validate('AcceptanceRecord', { ...acceptance, buyer_id: undefined }));
  const order = { id: 'order_1', buyer_id: 'buyer_1', offer_id: 'offer_1', offer_event_id: key,
    acceptance_id: 'accept_1', payment_id: 'pay_1', license_id: 'license_1', status: 'paid', created_at: 1000 };
  validate('Order', order);
  validate('Order', { ...order, status: 'pending', payment_id: null, license_id: null });
  assert.throws(() => validate('Order', { ...order, payment_id: null }));
  assert.throws(() => validate('Order', { ...order, status: 'pending' }));
});
test('download grants store hashes and validate expiry and single-consumption state', () => {
  validate('DownloadGrant', grant);
  validate('DownloadGrant', { ...grant, used_at: 1500 });
  validate('DownloadGrant', { ...grant, revoked_at: 1500 });
  for (const change of [{ token: 'raw-secret' }, { token_hash: 'not-a-hash' }, { expires_at: 999 },
    { used_at: 2000 }, { used_at: 999 }, { used_at: 1500, revoked_at: 1600 }, { revoked_at: 999 }]) {
    assert.throws(() => validate('DownloadGrant', { ...grant, ...change }));
  }
});
