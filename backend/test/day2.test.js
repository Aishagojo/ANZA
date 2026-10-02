import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools/pure';
import { createOfferService } from '../src/services/offers/service.js';
import { buildOfferEvent } from '../src/services/nostr/events.js';
import { createRelayPublisher } from '../src/services/nostr/publisher.js';
import { createAttestorSigner } from '../src/services/nostr/signer.js';
import { authenticate, sha256 } from '../src/middleware/auth.js';
import { HttpError } from '../src/utils/errors.js';
import { readConfig } from '../src/config/index.js';
import { matchOfferRoute } from '../src/routes/offers.js';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';

const pubkey = 'a'.repeat(64);
const attestorPubkey = 'b'.repeat(64);
const terms = { brand: 'Example', content_url: 'https://example.com/video', content_sha256: 'c'.repeat(64),
  amount_sats: 500, usage_rights: 'Organic social use only', duration: { type: 'fixed', days: 30 } };
const event = () => ({ ...buildOfferEvent({ kind: 9998, creatorPubkey: pubkey, attestorPubkey, terms, createdAt: 1000 }),
  id: 'd'.repeat(64), sig: 'e'.repeat(128) });
// Real keypair, so config tests exercise the same nsec/hex paths as production.
const generateKeypair = () => {
  const sk = Buffer.from(generateSecretKey()).toString('hex');
  return { sk, pk: getPublicKey(Buffer.from(sk, 'hex')) };
};

// In-memory test double only; production always uses PostgreSQL.
function setup(verifyEvent = () => true, paymentProvider = null, options = {}) {
  const offers = new Map(), requests = new Map(), outbox = [], licenses = new Map();
  const store = {
    getOffer: async id => offers.get(id),
    getOfferEvent: async id => outbox.find(entry => entry.role === 'offer' && entry.offerId === id)?.event,
    // Mirrors the targeted jsonb_set on {payment}: a full-document save here
    // would hide the clobber bug this exists to guard against.
    savePaymentState: async (id, payment) => {
      const current = offers.get(id);
      if (current) offers.set(id, { ...current, payment });
      return current;
    },
    saveOfferDocument: async document => {
      offers.set(document.offerId || document.id, document);
      return document;
    },
    getLicense: async offerId => [...licenses.values()].find(license => license.offerId === offerId) || null,
    createLicense: async ({ id, offerId, paymentId, startsAt, endsAt }) => {
      licenses.set(id, { id, offerId, paymentId, starts_at: startsAt, ends_at: endsAt, publication_status: 'pending', event_id: null });
    },
    queueLicenseEvent: async ({ eventId, offerId, licenseId, event }) => {
      outbox.push({ role: 'license', eventId, offerId, licenseId, event });
    },
    saveLightningWebhook: async entry => entry,
    async idempotent(scope, digest, work) {
      const prior = requests.get(scope);
      if (prior) {
        if (prior.digest !== digest) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Conflict');
        return prior.result;
      }
      const result = await work({
        insertOffer: async offer => offers.set(offer.id, offer),
        getOfferForUpdate: async id => offers.get(id),
        queueOffer: async (offer, signed) => { offers.set(offer.id, offer); outbox.push({ role: 'offer', offerId: offer.id, event: signed }); }
      });
      requests.set(scope, { digest, result });
      return result;
    }
  };
  return { offers, outbox, licenses, service: createOfferService({ store, verifyEvent, kind: 9998, attestorPubkey, speedWebhookSecret: 'test-webhook-secret', paymentProvider, now: () => 1000, ...options }) };
}
const create = (service, body = terms) => service.create({ pubkey, body, key: 'create-key-000001', digest: 'create-digest' });
const publish = (service, id, body = event()) => service.publish({ id, pubkey, body, key: 'publish-key-0001', digest: JSON.stringify(body) });

test('create validates input, assigns creator, and replays the saved result', async () => {
  const { service, offers } = setup();
  const first = await create(service);
  assert.equal(first.status, 201);
  assert.equal(first.body.creator_pubkey, pubkey);
  assert.equal(first.body.status, 'draft');
  assert.deepEqual(await create(service), first);
  assert.equal(offers.size, 1);
  await assert.rejects(service.create({ pubkey, body: { ...terms, amount_sats: 1 }, key: 'create-key-000001', digest: 'changed' }), { status: 409 });
  await assert.rejects(service.create({ body: { ...terms, amount_sats: -1 } }), { status: 400 });
  await assert.rejects(service.create({ body: { ...terms, content_url: 'https://user:password@example.com/' } }), { status: 400 });
});
test('payment requests a Polar LND invoice at the saved offer price and reuses an unexpired invoice', async () => {
  const invoices = [];
  const provider = { createInvoice: async input => {
    invoices.push(input);
    return { id: 'invoice-1', payment_hash: 'f'.repeat(64), request: 'lnbc1paymentrequest', amount_sat: '500', status: 'pending', expires_at: 4600 };
  } };
  const { service, offers } = setup(() => true, provider);
  const { body } = await create(service);
  offers.set(body.id, { ...body, status: 'published' });
  const payment = await service.createPayment(body.id);
  assert.equal(payment.status, 201);
  assert.deepEqual(payment.body, { offerId: body.id, amountSats: 500, paymentRequest: 'lnbc1paymentrequest' });
  assert.deepEqual(invoices, [{ amountSats: 500, description: 'ContentPort license: ' + body.id, expiry: 3600, reference: 'contentport_' + body.id }]);
  assert.equal((await service.createPayment(body.id)).status, 200);
  assert.equal(invoices.length, 1);
  assert.deepEqual((await service.getStatus(body.id)).body, { offerId: body.id, status: 'PAYMENT_PENDING' });
});
test('payment replaces an expired pending Lightning invoice', async () => {
  let calls = 0;
  const provider = { createInvoice: async () => {
    calls += 1;
    return { id: `invoice-${calls}`, payment_hash: String(calls).repeat(64), request: `lnbc1fresh${calls}`,
      amount_sat: 500, status: 'pending', expires_at: 4600 };
  } };
  const { service, offers } = setup(() => true, provider);
  const { body } = await create(service);
  offers.set(body.id, { ...body, status: 'published', payment: {
    status: 'pending', amount_sats: 500, request: 'lnbc1expired', expires_at: 999
  } });
  const result = await service.createPayment(body.id);
  assert.equal(result.status, 201);
  assert.equal(result.body.paymentRequest, 'lnbc1fresh1');
  assert.equal(calls, 1);
});
test('status records a Polar LND settlement before reporting it to the frontend', async () => {
  const provider = { lookupInvoice: async hash => {
    assert.equal(hash, 'f'.repeat(64));
    return { status: 'settled', settled_at: 1200 };
  } };
  const { service, offers } = setup(() => true, provider);
  const { body } = await create(service);
  offers.set(body.id, { ...body, status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 500, request: 'lnbc1paymentrequest'
  } });
  // This deployment has no attestor key or license kind, so the buyer must be
  // told licensing is unavailable rather than left waiting for a license that
  // is never going to be produced.
  assert.deepEqual((await service.getStatus(body.id)).body, {
    offerId: body.id, status: 'PAYMENT_SETTLED', paymentSettledAt: 1200, licenseIssuance: 'unavailable'
  });
  assert.equal(offers.get(body.id).payment.status, 'settled');
});
test('a settled offer queues one signed license event and does not re-sign on later polls', async () => {
  const provider = { lookupInvoice: async () => ({ status: 'settled', settled_at: 1200 }) };
  const signed = [];
  const signEvent = async (template, secretKey) => {
    signed.push({ template, secretKey });
    return { ...template, id: 'c'.repeat(64), sig: 'f'.repeat(128) };
  };
  const attestorSecretKey = 'b'.repeat(64);
  const { service, offers, outbox, licenses } = setup(() => true, provider, {
    licenseKind: 9999, attestorSecretKey, signEvent
  });
  const { body } = await create(service);
  await publish(service, body.id);
  offers.set(body.id, { ...offers.get(body.id), status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 500, request: 'lnbc1paymentrequest'
  } });

  // Signing is configured, so the license is queued and the buyer is told it is
  // still being issued. It is not "published" until the relay accepts it.
  const firstPoll = (await service.getStatus(body.id)).body;
  assert.equal(firstPoll.status, 'PAYMENT_SETTLED');
  assert.equal(firstPoll.licenseIssuance, 'pending');
  assert.equal(firstPoll.license, undefined);
  assert.equal(signed.length, 1);
  assert.equal(signed[0].secretKey, attestorSecretKey);
  assert.equal(signed[0].template.kind, 9999);
  assert.equal(signed[0].template.pubkey, attestorPubkey);

  // The license references the published offer and carries the duration the
  // publisher derived from settlement time.
  const template = signed[0].template;
  const payload = JSON.parse(template.content);
  assert.equal(template.tags[0][0], 'e');
  assert.equal(template.tags[0][1], event().id);
  assert.equal(template.tags[2][1], 'contentport-license-v1');
  assert.equal(payload.amount_sats, 500);
  assert.equal(payload.starts_at, 1200);
  assert.equal(payload.ends_at, 1200 + 30 * 86400);
  assert.equal(outbox.filter(entry => entry.role === 'license').length, 1);
  assert.equal(licenses.size, 1);

  // Polling is the normal path, so a repeat must not sign or queue again.
  await service.getStatus(body.id);
  assert.equal(signed.length, 1);
  assert.equal(outbox.filter(entry => entry.role === 'license').length, 1);
});
test('the offer record carries the license once the relay has accepted it', async () => {
  // The licensed screen reads GET /offers/:id, not /status, so the license has
  // to travel with the offer or the confirmation page can never show it.
  const provider = { lookupInvoice: async () => ({ status: 'settled', settled_at: 1200 }) };
  const signEvent = async template => ({ ...template, id: 'c'.repeat(64), sig: 'f'.repeat(128) });
  const { service, offers, licenses } = setup(() => true, provider, { licenseKind: 9999, attestorSecretKey: 'b'.repeat(64), signEvent });
  const { body } = await create(service);
  await publish(service, body.id);
  offers.set(body.id, { ...offers.get(body.id), status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 500, request: 'lnbc1paymentrequest'
  } });

  // Settled but not yet relayed: the license must not be advertised.
  await service.getStatus(body.id);
  const pending = (await service.get(body.id)).body;
  assert.equal(pending.license_issuance, 'pending');
  assert.equal(pending.license, undefined);

  // The publication worker marks it published and flips the offer to licensed.
  const [license] = [...licenses.values()];
  licenses.set(license.id, { ...license, publication_status: 'published', event_id: 'c'.repeat(64) });
  offers.set(body.id, { ...offers.get(body.id), status: 'licensed' });

  const licensed = (await service.get(body.id)).body;
  assert.equal(licensed.license_issuance, 'published');
  assert.deepEqual(licensed.license, { eventId: 'c'.repeat(64), startsAt: 1200, endsAt: 1200 + 30 * 86400 });
  assert.deepEqual((await service.getStatus(body.id)).body.license, licensed.license);
});
test('a perpetual license never receives an expiry', async () => {
  const provider = { lookupInvoice: async () => ({ status: 'settled', settled_at: 1200 }) };
  const signed = [];
  const signEvent = async template => { signed.push(template); return { ...template, id: 'c'.repeat(64), sig: 'f'.repeat(128) }; };
  const { service, offers } = setup(() => true, provider, { licenseKind: 9999, attestorSecretKey: 'b'.repeat(64), signEvent });
  const perpetual = { ...terms, duration: { type: 'perpetual' } };
  const { body } = await create(service, perpetual);
  await publish(service, body.id, { ...buildOfferEvent({ kind: 9998, creatorPubkey: pubkey, attestorPubkey, terms: perpetual, createdAt: 1000 }),
    id: 'd'.repeat(64), sig: 'e'.repeat(128) });
  offers.set(body.id, { ...offers.get(body.id), status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 500, request: 'lnbc1paymentrequest'
  } });
  await service.getStatus(body.id);
  assert.equal(signed.length, 1);
  assert.equal(JSON.parse(signed[0].content).ends_at, null);
});
test('a settlement that disagrees with the published offer is refused, not attested', async () => {
  const provider = { lookupInvoice: async () => ({ status: 'settled', settled_at: 1200 }) };
  const signed = [];
  const { service, offers } = setup(() => true, provider, {
    licenseKind: 9999, attestorSecretKey: 'b'.repeat(64), signEvent: async t => { signed.push(t); return t; }
  });
  const { body } = await create(service);
  await publish(service, body.id);
  // The offer on record is for 500 sats, but the invoice settled at 5000.
  offers.set(body.id, { ...offers.get(body.id), status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 5000, request: 'lnbc1paymentrequest'
  } });
  await assert.rejects(service.getStatus(body.id), { status: 500, code: 'LICENSE_BUILD_FAILED' });
  assert.equal(signed.length, 0);
});
test('the attestor signer converts the configured hex key into signing bytes', () => {
  // finalizeEvent throws "expected Uint8Array" if handed the hex string config
  // produces, so the real signer is exercised here rather than only a stub.
  const { sk, pk } = generateKeypair();
  const template = { kind: 9999, pubkey: pk, created_at: 1000, tags: [['t', 'x']], content: '{}' };
  const signed = createAttestorSigner()(template, sk);
  assert.equal(signed.pubkey, pk);
  assert.equal(verifyEvent(signed), true);
  // A key that is not 32 hex bytes must fail loudly rather than sign nothing.
  assert.throws(() => createAttestorSigner()(template, 'abc'), /32-byte lowercase hex/);
});
test('a settled offer without an attestor key stays settled and issues no license', async () => {
  const provider = { lookupInvoice: async () => ({ status: 'settled', settled_at: 1200 }) };
  const { service, offers, outbox } = setup(() => true, provider);
  const { body } = await create(service);
  offers.set(body.id, { ...body, status: 'published', payment: {
    provider: 'polar-lnd', payment_hash: 'f'.repeat(64), status: 'pending', amount_sats: 500, request: 'lnbc1paymentrequest'
  } });
  assert.equal((await service.getStatus(body.id)).body.status, 'PAYMENT_SETTLED');
  assert.equal((await service.getStatus(body.id)).body.licenseIssuance, 'unavailable');
  assert.equal(outbox.filter(entry => entry.role === 'license').length, 0);
});
test('the attestor secret is accepted as an nsec and must match the attestor pubkey', () => {
  // nip19 returns raw bytes for an nsec, so config must convert before use.
  const { sk, pk } = generateKeypair();
  const nsec = nip19.nsecEncode(Uint8Array.from(Buffer.from(sk, 'hex')));
  const env = { DATABASE_URL: 'postgresql://localhost/test', NOSTR_OFFER_KIND: '9998', NOSTR_RELAYS: 'ws://localhost:7777' };
  assert.equal(readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: pk, NOSTR_ATTESTOR_SECRET: nsec }).attestorSecretKey, sk);
  assert.equal(readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: pk, NOSTR_ATTESTOR_SECRET: sk }).attestorSecretKey, sk);
  assert.equal(readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: pk }).attestorSecretKey, null);
  // A key that does not match the advertised attestor would sign under a
  // different identity than offers reference, so it must fail loudly.
  const other = generateKeypair();
  assert.throws(() => readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: other.pk, NOSTR_ATTESTOR_SECRET: nsec }),
    /does not match/);
  // ncryptsec is an encrypted envelope and cannot be used as a signing key.
  assert.throws(() => readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: pk, NOSTR_ATTESTOR_SECRET: 'ncryptsec1qqq' }),
    /ncryptsec/);
});
test('the license kind is configured separately from the offer kind', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', NOSTR_OFFER_KIND: '9998',
    NOSTR_ATTESTOR_PUBKEY: attestorPubkey, NOSTR_RELAYS: 'ws://localhost:7777' };
  assert.equal(readConfig(env).licenseKind, null);
  assert.equal(readConfig({ ...env, NOSTR_LICENSE_KIND: '9999' }).licenseKind, 9999);
  assert.throws(() => readConfig({ ...env, NOSTR_LICENSE_KIND: '9998' === '9998' ? '10000' : '1' }));
  assert.throws(() => readConfig({ ...env, NOSTR_LICENSE_KIND: '1' }));
});
test('draft reads require the owner; published offers are public', async () => {
  const { service, offers } = setup();
  const { body } = await create(service);
  await assert.rejects(service.get(body.id), { status: 404 });
  await assert.rejects(service.get(body.id, attestorPubkey), { status: 404 });
  assert.equal((await service.get(body.id, pubkey)).status, 200);
  offers.set(body.id, { ...body, status: 'published' });
  assert.equal((await service.get(body.id)).status, 200);
});
test('publishing queues the signed event exactly once and does not claim relay success', async () => {
  const { service, outbox } = setup();
  const { body } = await create(service);
  const result = await publish(service, body.id);
  assert.equal(result.status, 202);
  assert.equal(result.body.status, 'publishing');
  assert.equal(result.body.event_id, event().id);
  await publish(service, body.id);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].role, 'offer');
  assert.deepEqual(outbox[0].event, event());
});
test('forged events, different owners, changed terms and stale events are rejected', async () => {
  const bad = setup(() => false);
  await assert.rejects(publish(bad.service, (await create(bad.service)).body.id), { status: 400 });
  const { service, outbox } = setup();
  const { body } = await create(service);
  await assert.rejects(service.publish({ id: body.id, pubkey: attestorPubkey, body: event(), key: 'other', digest: 'other' }), { status: 403 });
  for (const change of [
    { kind: 9999 }, { created_at: 0 }, { pubkey: attestorPubkey }, { tags: [] },
    { content: JSON.stringify({ schema: 'contentport.offer.v1', terms: { ...terms, amount_sats: 1 }, attestor_pubkey: attestorPubkey }) }
  ]) await assert.rejects(publish(service, body.id, { ...event(), ...change }), { status: 400 });
  assert.equal(outbox.length, 0);
});
test('a queued offer cannot be replaced with another event', async () => {
  const { service, outbox } = setup();
  const { body } = await create(service);
  await publish(service, body.id);
  await assert.rejects(service.publish({ id: body.id, pubkey, body: { ...event(), id: 'f'.repeat(64) }, key: 'new-key', digest: 'new' }), { status: 409 });
  assert.equal(outbox.length, 1);
});

function authFixture() {
  const rawBody = Buffer.from(JSON.stringify(terms));
  const key = 'create-key-000001';
  const auth = { ...event(), kind: 27235, content: '', tags: [
    ['u', 'http://localhost:3000/api/offers'], ['method', 'POST'],
    ['payload', sha256(rawBody)], ['contentport-idempotency-key', key]
  ] };
  return { auth, args: { method: 'POST', url: 'http://localhost:3000/api/offers', rawBody,
    idempotencyKey: key, now: 1000, verifyEvent: () => true } };
}
const header = auth => 'Nostr ' + Buffer.from(JSON.stringify(auth)).toString('base64');
test('HTTP auth binds the signer to URL, method, raw body and idempotency key', () => {
  const { auth, args } = authFixture();
  assert.equal(authenticate({ ...args, authorization: header(auth) }), pubkey);
  for (const change of [{ method: 'GET' }, { url: args.url + '?changed=1' }, { rawBody: Buffer.from('{}') },
    { idempotencyKey: 'different' }, { now: 2000 }, { verifyEvent: () => false }]) {
    assert.throws(() => authenticate({ ...args, authorization: header(auth), ...change }), { status: 401 });
  }
  auth.tags.push(['u', args.url]);
  assert.throws(() => authenticate({ ...args, authorization: header(auth) }), { status: 401 });
});

function socketType(behavior) {
  return class extends EventEmitter {
    constructor(url) { super(); this.url = url; queueMicrotask(() => this.emit('open')); }
    addEventListener(name, callback) { this.on(name, callback); }
    send(data) { const [, signed] = JSON.parse(data); behavior(this, signed); }
    close() { this.emit('close'); }
  };
}
test('publisher requires a positive OK for the exact event ID', async () => {
  const WebSocketImpl = socketType((socket, signed) => {
    socket.emit('message', { data: JSON.stringify(['OK', 'wrong-id', true, '']) });
    socket.emit('message', { data: JSON.stringify(['OK', signed.id, true, 'saved']) });
  });
  const publishEvent = createRelayPublisher({ relays: ['wss://example.com'], WebSocketImpl });
  assert.equal(await publishEvent(event()), 'wss://example.com');
});
test('relay rejection and missing acknowledgements fail; another relay can succeed', async () => {
  const reject = socketType((socket, signed) => socket.emit('message', { data: JSON.stringify(['OK', signed.id, false, 'blocked']) }));
  await assert.rejects(createRelayPublisher({ relays: ['wss://bad'], WebSocketImpl: reject })(event()), /No configured relay/);
  await assert.rejects(createRelayPublisher({ relays: ['wss://silent'], WebSocketImpl: socketType(() => {}), timeoutMs: 10 })(event()));
  const mixed = socketType((socket, signed) => socket.emit('message', { data: JSON.stringify(['OK', signed.id, socket.url.endsWith('good'), '']) }));
  assert.equal(await createRelayPublisher({ relays: ['wss://bad', 'wss://good'], WebSocketImpl: mixed })(event()), 'wss://good');
});
test('configuration rejects missing keys and insecure non-local relays', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', NOSTR_OFFER_KIND: '9998', NOSTR_ATTESTOR_PUBKEY: attestorPubkey, NOSTR_RELAYS: 'ws://localhost:7777' };
  assert.equal(readConfig(env).kind, 9998);
  assert.equal(readConfig({ ...env, NOSTR_ATTESTOR_PUBKEY: nip19.npubEncode(attestorPubkey) }).attestorPubkey, attestorPubkey);

  assert.throws(() => readConfig({ ...env, NOSTR_OFFER_KIND: '' }));
  assert.throws(() => readConfig({ ...env, NOSTR_RELAYS: 'ws://remote.example' }));
  assert.equal(matchOfferRoute('POST', '/api/offers').action, 'create');
  assert.equal(matchOfferRoute('POST', '/api/offers/abc/publish').action, 'publish');
});

test('HTTP routing returns JSON, validates auth, and creates an offer', async () => {
  const { service } = setup();
  const app = createApp({ service, verifyEvent: () => true, origin: 'http://localhost:3000', now: () => 1000 });
  const inject = (url, method, headers = {}, payload = '') => new Promise(resolve => {
    const request = Readable.from(payload ? [Buffer.from(payload)] : []);
    Object.assign(request, { url, method, headers });
    let status;
    app.emit('request', request, {
      setHeader() {}, writeHead(code) { status = code; },
      end(body) { resolve({ status, body: JSON.parse(body) }); }
    });
  });
  const { auth, args } = authFixture();
  const headers = { 'content-type': 'application/json', 'idempotency-key': args.idempotencyKey };
  assert.equal((await inject('/api/offers', 'POST', headers, args.rawBody.toString())).status, 401);
  const created = await inject('/api/offers', 'POST', { ...headers, authorization: header(auth) }, args.rawBody.toString());
  assert.equal(created.status, 201);
  assert.equal(created.body.creator_pubkey, pubkey);
  assert.equal((await inject(`/api/offers/${created.body.id}`, 'GET')).status, 404);
  assert.equal((await inject('/api/payments/test', 'GET')).status, 404);
  app.close();
});

test('lightning webhook endpoint accepts signed Speed callbacks', async () => {
  const received = [];
  const store = {
    getOffer: async () => undefined,
    saveOfferDocument: async document => document,
    saveLightningWebhook: async entry => { received.push(entry); return entry; },
    async idempotent(scope, digest, work) {
      return work({ insertOffer: async offer => offer, getOfferForUpdate: async () => undefined, queueOffer: async offer => offer });
    }
  };
  const secret = 'wsec_c3BlZWQtd2ViaG9vay1zZWNyZXQ=';
  const service = createOfferService({ store, verifyEvent: () => true, kind: 9998, attestorPubkey, speedWebhookSecret: secret, now: () => 1000 });
  const app = createApp({ service, verifyEvent: () => true, origin: 'http://localhost:3000', now: () => 1000 });
  const inject = (url, method, headers = {}, payload = '') => new Promise(resolve => {
    const request = Readable.from(payload ? [Buffer.from(payload)] : []);
    Object.assign(request, { url, method, headers });
    let status;
    app.emit('request', request, { setHeader() {}, writeHead(code) { status = code; }, end(body) { resolve({ status, body: JSON.parse(body) }); } });
  });
  const payload = JSON.stringify({
    event_type: 'payment.paid',
    data: { object: { id: 'pi_123', metadata: { offer_id: 'contentport_offer_123' }, payment_method_options: { lightning: { id: 'lni_123' } } } }
  });
  const id = 'msg_123';
  const timestamp = '1000';
  const signature = createHmac('sha256', Buffer.from('c3BlZWQtd2ViaG9vay1zZWNyZXQ=', 'base64'))
    .update(`${id}.${timestamp}.${payload}`).digest('base64');
  assert.equal((await inject('/api/webhooks/lightning', 'POST', { 'content-type': 'application/json' }, payload)).status, 401);
  assert.equal((await inject('/api/webhooks/lightning', 'POST', { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,bad' }, payload)).status, 401);
  const result = await inject('/api/webhooks/speed/lightning', 'POST', { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` }, payload);
  assert.equal(result.status, 200);
  assert.equal(result.body.received, true);
  assert.equal(result.body.provider, 'speed');
  assert.equal(result.body.eventType, 'payment.paid');
  assert.equal(result.body.offerId, 'offer_123');
  assert.equal(received.length, 1);
  assert.equal(received[0].provider, 'speed');
  assert.equal(received[0].paymentHash, 'lni_123');
  app.close();
});
test('real Nostr signature verification (requires installed nostr-tools)', async t => {
  let tools;
  try { tools = await import('nostr-tools/pure'); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') { t.skip('nostr-tools installation was not approved'); return; } throw error; }
  const secret = tools.generateSecretKey();
  const signed = tools.finalizeEvent({ kind: 9998, created_at: 1000, tags: [], content: 'original' }, secret);
  assert.equal(tools.verifyEvent(JSON.parse(JSON.stringify(signed))), true);
  assert.equal(tools.verifyEvent({ ...JSON.parse(JSON.stringify(signed)), content: 'tampered' }), false);
});
