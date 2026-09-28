import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createOfferService } from '../src/services/offers/service.js';
import { buildOfferEvent } from '../src/services/nostr/events.js';
import { createRelayPublisher } from '../src/services/nostr/publisher.js';
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

// In-memory test double only; production always uses PostgreSQL.
function setup(verifyEvent = () => true) {
  const offers = new Map(), requests = new Map(), outbox = [];
  const store = {
    getOffer: async id => offers.get(id),
    saveOfferDocument: async document => {
      offers.set(document.offerId || document.id, document);
      return document;
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
        queueOffer: async (offer, signed) => { offers.set(offer.id, offer); outbox.push(signed); }
      });
      requests.set(scope, { digest, result });
      return result;
    }
  };
  return { offers, outbox, service: createOfferService({ store, verifyEvent, kind: 9998, attestorPubkey, now: () => 1000 }) };
}
const create = service => service.create({ pubkey, body: terms, key: 'create-key-000001', digest: 'create-digest' });
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
  assert.deepEqual(outbox[0], event());
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

test('lightning webhook endpoint accepts Bitnob-style callbacks', async () => {
  const received = [];
  const store = {
    getOffer: async () => undefined,
    saveOfferDocument: async document => document,
    saveLightningWebhook: async entry => {
      received.push(entry);
      return entry;
    },
    async idempotent(scope, digest, work) {
      return work({
        insertOffer: async offer => offer,
        getOfferForUpdate: async () => undefined,
        queueOffer: async offer => offer
      });
    }
  };
  const service = createOfferService({ store, verifyEvent: () => true, kind: 9998, attestorPubkey, now: () => 1000 });
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

  const payload = JSON.stringify({
    provider: 'bitnob',
    type: 'payment.received',
    payment_hash: 'f'.repeat(64),
    offerId: 'offer_123',
    amount_sats: 5000,
    status: 'settled'
  });

  const result = await inject('/api/webhooks/lightning', 'POST', { 'content-type': 'application/json' }, payload);
  assert.equal(result.status, 202);
  assert.equal(result.body.received, true);
  assert.equal(result.body.provider, 'bitnob');
  assert.equal(result.body.eventType, 'payment.received');
  assert.equal(result.body.offerId, 'offer_123');
  assert.equal(received.length, 1);
  assert.equal(received[0].provider, 'bitnob');
  assert.equal(received[0].paymentHash, 'f'.repeat(64));
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
