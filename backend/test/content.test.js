import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createOfferService } from '../src/services/offers/service.js';
import { createContentService } from '../src/services/content/service.js';
import { createCloudinary, mediaRef, originalUrl } from '../src/services/media/cloudinary.js';
import { buildOfferEvent } from '../src/services/nostr/events.js';
import { createApp } from '../src/app.js';
import { matchVideoRoute } from '../src/routes/content.js';
import { HttpError } from '../src/utils/errors.js';

const creator = 'a'.repeat(64);
const other = 'b'.repeat(64);
const attestorPubkey = 'c'.repeat(64);
const FOLDER = 'contentport/videos';
const SECRET = 'cloudinary-api-secret';
const cloudinary = createCloudinary({ cloudName: 'demo', apiKey: 'apikey123', apiSecret: SECRET, folder: FOLDER });

// In-memory test double only; production always uses PostgreSQL. Mirrors the
// shape of test/day2.test.js and adds the content-layer queries.
function setup({ verifyEvent = () => true, paymentProvider = null, media = cloudinary } = {}) {
  const offers = new Map(), videos = new Map(), requests = new Map(), sessions = new Map(), outbox = [];
  const store = {
    getOffer: async id => offers.get(id),
    saveOfferDocument: async document => { offers.set(document.offerId || document.id, document); return document; },
    saveLightningWebhook: async entry => entry,
    getOwnedVideo: async (id, owner) => {
      const video = videos.get(id);
      return video && video.owner_public_key === owner ? video : undefined;
    },
    insertVideo: async video => { videos.set(video.id, video); return video; },
    listVideosByOwner: async owner => [...videos.values()].filter(v => v.owner_public_key === owner),
    deleteOwnedVideo: async (id, owner) => {
      const video = videos.get(id);
      if (!video || video.owner_public_key !== owner) return 0;
      return videos.delete(id) ? 1 : 0;
    },
    listOffersForVideo: async videoId => [...offers.values()].filter(o => o.video_id === videoId).map(offerSummaryRow),
    listOffersForOwner: async owner => [...offers.values()].filter(o => o.creator_pubkey === owner && o.video_id)
      .map(offer => ({ video_id: offer.video_id, ...offerSummaryRow(offer) })),
    listDiscoverableOffers: async () => [...offers.values()]
      .filter(offer => ['published', 'licensing'].includes(offer.status))
      .map(offer => ({ offer, video: offer.video_id ? videos.get(offer.video_id) : null })),
    async idempotent(scope, digest, work) {
      const prior = requests.get(scope);
      if (prior) {
        if (prior.digest !== digest) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Conflict');
        return prior.result;
      }
      const result = await work({
        insertOffer: async offer => { offers.set(offer.id, offer); return offer; },
        getOfferForUpdate: async id => offers.get(id),
        queueOffer: async (offer, signed) => { offers.set(offer.id, offer); outbox.push(signed); },
        insertVideo: async video => { videos.set(video.id, video); return video; },
        issueUploadSession: async session => { sessions.set(session.id, session); },
        consumeUploadSession: async (id, owner, at) => {
          const session = sessions.get(id);
          if (!session || session.owner_public_key !== owner || session.expires_at <= at) return false;
          return sessions.delete(id);
        }
      });
      requests.set(scope, { digest, result });
      return result;
    }
  };
  return {
    offers, videos, outbox, store, sessions,
    service: createOfferService({ store, verifyEvent, kind: 9998, attestorPubkey, speedWebhookSecret: 'test-webhook-secret', paymentProvider, now: () => 1000 }),
    content: createContentService({ store, cloudinary: media, now: () => 1000 })
  };
}
const offerSummaryRow = offer => ({ id: offer.id, status: offer.status, amount_sats: offer.terms.amount_sats, created_at: offer.created_at });

// Every request needs its own idempotency key, otherwise the store replays the
// first response instead of running the work.
let sequence = 0;
const nextKey = prefix => `${prefix}-${String(++sequence).padStart(12, '0')}`;
const authorize = (content, pubkey = creator) => content.authorizeUpload({ pubkey, key: nextKey('upload'), digest: nextKey('digest') });
const registration = (context, overrides = {}) => ({
  title: 'Mountain view', upload_session_id: context.upload_session_id, public_id: `${FOLDER}/abc123`,
  asset_version: 7, resource_type: 'video', format: 'mp4', context: context.context,
  status: 'ready', original_sha256: 'f'.repeat(64), bytes: 4096, duration_seconds: 45, width: 1920, height: 1080, ...overrides
});
const unissuedContext = () => ({ upload_session_id: 'b'.repeat(32), context: 'contentport_session=' + 'b'.repeat(32) });

// Uploads a video and returns the canonical owned-video record.
async function upload(content, pubkey = creator, overrides = {}) {
  const auth = (await authorize(content, pubkey)).body;
  const registered = await content.register({ pubkey, body: registration(auth, overrides), key: nextKey('register'), digest: nextKey('digest') });
  return registered.body;
}

// ---------------------------------------------------------------------------
// Upload authorisation
// ---------------------------------------------------------------------------

test('upload authorisation signs parameters and never reveals the Cloudinary secret', async () => {
  const { content } = setup();
  const { status, body } = await authorize(content);
  assert.equal(status, 201);
  assert.equal(body.cloud_name, 'demo');
  assert.equal(body.api_key, 'apikey123');
  assert.match(body.signature, /^[0-9a-f]{40}$/);
  assert.ok(body.upload_session_id.length >= 16);
  assert.equal(JSON.stringify(body).includes(SECRET), false);
});

// Cloudinary reconstructs the string to sign from the request and rejects the
// upload as an invalid signature when it differs. This pins the exact payload,
// because the mismatch is invisible from the signature's shape alone.
//
// Cloudinary excludes file, cloud_name, resource_type and api_key. resource_type
// is the trap: it travels in the upload URL path, not as a request parameter, so
// signing it produces a string Cloudinary never rebuilds.
test('the signature covers exactly the string Cloudinary reconstructs', () => {
  const session = 'a'.repeat(32);
  const issued = cloudinary.createUploadAuthorization({ uploadSessionId: session, timestamp: 1790888846 });
  const expected = createHash('sha1')
    .update(`context=contentport_session=${session}&folder=${FOLDER}&timestamp=1790888846` + SECRET)
    .digest('hex');
  assert.equal(issued.signature, expected);
  assert.equal(issued.resource_type, 'video', 'still returned, the browser needs it for the upload URL');
  assert.deepEqual(Object.keys(issued).sort(),
    ['allowed_formats', 'api_key', 'cloud_name', 'context', 'folder', 'resource_type', 'signature', 'timestamp', 'upload_session_id']);
});

test('a media-management parameter can never leak into the signature', () => {
  // Guards the general rule rather than the single instance that broke: real
  // request parameters such as tags are signed, media-management keys are not.
  const signatureFor = extra => cloudinary
    .createUploadAuthorization({ uploadSessionId: 'b'.repeat(32), timestamp: 1790888846, ...extra }).signature;
  assert.notEqual(signatureFor({}), signatureFor({ tags: 'anza' }), 'a real parameter must be signed');
  for (const excluded of [{ resource_type: 'video' }, { api_key: 'other' }, { cloud_name: 'other' }, { file: 'x' }, { signature: 'x' }]) {
    assert.equal(signatureFor({}), signatureFor(excluded), `${Object.keys(excluded)[0]} must not be signed`);
  }
});

test('a video cannot be registered without a signed upload session, or with a replayed one', async () => {
  const { content } = setup();
  // No authorisation was ever issued for this session id.
  await assert.rejects(content.register({ pubkey: creator, body: registration(unissuedContext()), key: nextKey('register'), digest: 'd' }), { status: 403 });
  const auth = (await authorize(content)).body;
  const body = registration(auth);
  assert.equal((await content.register({ pubkey: creator, body, key: nextKey('register'), digest: 'd' })).status, 201);
  // The session is single use, so the same authorisation cannot register a second asset.
  await assert.rejects(content.register({ pubkey: creator, body: { ...body, public_id: `${FOLDER}/other` }, key: nextKey('register'), digest: 'e' }), { status: 403 });
});

test('one creator cannot register an asset using another creator’s upload session', async () => {
  const { content } = setup();
  const auth = (await authorize(content, creator)).body;
  await assert.rejects(content.register({ pubkey: other, body: registration(auth), key: nextKey('register'), digest: 'd' }), { status: 403 });
});

test('registration rejects assets outside the ContentPort folder and unsupported formats', async () => {
  const { content } = setup();
  const auth = (await authorize(content)).body;
  for (const override of [{ public_id: 'someone-else/abc123' }, { public_id: FOLDER }, { format: 'exe' }]) {
    await assert.rejects(content.register({ pubkey: creator, body: registration(auth, override), key: nextKey('register'), digest: 'd' }),
      { status: 400 });
  }
});

test('the content layer reports when Cloudinary is not configured', async () => {
  const { content } = setup({ media: null });
  await assert.rejects(authorize(content), { status: 501 });
});

test('the server derives the authoritative fingerprint and keeps the reported one alongside it', async () => {
  const { content } = setup();
  const { video } = await upload(content);
  assert.equal(video.owner_public_key, creator);
  assert.equal(video.original_sha256, 'f'.repeat(64));
  // Derived from the asset reference, so the creator cannot choose it.
  assert.equal(video.reference_sha256, cloudinary.referenceSha256(`${FOLDER}/abc123`, 7));
  assert.notEqual(video.reference_sha256, video.original_sha256);
  // A re-upload under a new Cloudinary version yields a different fingerprint.
  const next = await upload(content, creator, { public_id: `${FOLDER}/abc123`, asset_version: 8 });
  assert.notEqual(next.video.reference_sha256, video.reference_sha256);
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

test('the creator library returns only the authenticated creator’s own videos', async () => {
  const { content } = setup();
  await upload(content, creator);
  await upload(content, creator, { public_id: `${FOLDER}/second` });
  await upload(content, other, { public_id: `${FOLDER}/theirs` });
  const mine = await content.listMine({ pubkey: creator });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.videos.length, 2);
  assert.ok(mine.body.videos.every(entry => entry.video.owner_public_key === creator));
  const theirs = await content.listMine({ pubkey: other });
  assert.deepEqual(theirs.body.videos.map(entry => entry.video.public_id), [`${FOLDER}/theirs`]);
  assert.deepEqual((await content.listMine({ pubkey: 'd'.repeat(64) })).body.videos, []);
});

test('a creator cannot read, update or delete another creator’s video by changing the id', async () => {
  const { content } = setup();
  const { video } = await upload(content, creator);
  await assert.rejects(content.getOne({ id: video.id, pubkey: other }), { status: 404 });
  await assert.rejects(content.getOne({ id: video.id, pubkey: 'd'.repeat(64) }), { status: 404 });
  await assert.rejects(content.remove({ id: video.id, pubkey: other }), { status: 404 });
  assert.equal((await content.getOne({ id: video.id, pubkey: creator })).status, 200);
  assert.equal((await content.remove({ id: video.id, pubkey: creator })).status, 200);
  await assert.rejects(content.getOne({ id: video.id, pubkey: creator }), { status: 404 });
});

test('a video referenced by an offer cannot be deleted', async () => {
  const { content, service } = setup();
  const { video } = await upload(content, creator);
  await service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1',
    body: { video_id: video.id, brand: 'Acme', amount_sats: 5000, usage_rights: 'Social use', duration: { type: 'fixed', days: 30 } } });
  await assert.rejects(content.remove({ id: video.id, pubkey: creator }), { status: 409 });
});

test('a creator cannot supply a public key to claim or read content', async () => {
  const { content } = setup();
  const { video } = await upload(content, creator);
  // The stored owner always comes from the authenticated key, never the body.
  await assert.rejects(content.register({ pubkey: other, body: registration(unissuedContext(), { title: 'stolen' }), key: nextKey('register'), digest: 'd' }), { status: 403 });
  assert.equal((await content.listMine({ pubkey: other })).body.videos.length, 0);
  assert.equal((await content.getOne({ id: video.id, pubkey: creator })).body.video.owner_public_key, creator);
});

// ---------------------------------------------------------------------------
// Video -> Offer integration
// ---------------------------------------------------------------------------

test('creating an offer from a video resolves the canonical media reference server-side', async () => {
  const { content, service } = setup();
  const { video } = await upload(content, creator);
  const created = await service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1', body: {
    video_id: video.id, brand: 'Acme Kenya', amount_sats: 5000, usage_rights: 'Organic social use',
    duration: { type: 'fixed', days: 30 } } });
  assert.equal(created.status, 201);
  assert.equal(created.body.video_id, video.id);
  assert.equal(created.body.creator_pubkey, creator);
  // The browser sent no media URL at all; the offer carries a watermarked preview.
  assert.ok(created.body.terms.content_url.includes('res.cloudinary.com/demo/'));
  assert.ok(created.body.terms.content_url.includes('l_text:'));
  assert.equal(created.body.terms.content_sha256, video.reference_sha256);
  // The resolved terms remain valid signed offer terms.
  const template = buildOfferEvent({ kind: 9998, creatorPubkey: creator, attestorPubkey, terms: created.body.terms, createdAt: 1000 });
  assert.equal(JSON.parse(template.content).terms.amount_sats, 5000);
});

test('a client cannot override the media reference of a video-backed offer', async () => {
  const { content, service } = setup();
  const { video } = await upload(content, creator);
  await assert.rejects(service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1', body: {
    video_id: video.id, content_url: 'https://attacker.example/evil.mp4', content_sha256: '0'.repeat(64),
    brand: 'Acme', amount_sats: 5000, usage_rights: 'Social use', duration: { type: 'perpetual' } } }), { status: 400 });
});

test('a creator cannot create an offer from another creator’s video, and offers require a ready video', async () => {
  const { content, service } = setup();
  const { video } = await upload(content, creator);
  const draft = { brand: 'Acme', amount_sats: 5000, usage_rights: 'Social use', duration: { type: 'perpetual' } };
  await assert.rejects(service.create({ pubkey: other, key: 'other-key-001', digest: 'o2', body: { ...draft, video_id: video.id } }), { status: 404 });
  await assert.rejects(service.create({ pubkey: creator, key: 'miss-key-0001', digest: 'o3', body: { ...draft, video_id: 'nope' } }), { status: 404 });

  const processing = await upload(content, creator, { public_id: `${FOLDER}/pending`, status: 'processing' });
  await assert.rejects(service.create({ pubkey: creator, key: 'proc-key-0001', digest: 'o4', body: { ...draft, video_id: processing.video.id } }), { status: 409 });
});

test('the creator library reports the authoritative offer relationship for each video', async () => {
  const { content, service, offers } = setup();
  const withOffer = await upload(content, creator);
  const without = await upload(content, creator, { public_id: `${FOLDER}/bare` });
  const created = await service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1', body: {
    video_id: withOffer.video.id, brand: 'Acme', amount_sats: 5000, usage_rights: 'Social use', duration: { type: 'fixed', days: 30 } } });
  offers.set(created.body.id, { ...created.body, status: 'published' });
  const library = await content.listMine({ pubkey: creator });
  const linked = library.body.videos.find(entry => entry.video.id === withOffer.video.id);
  const bare = library.body.videos.find(entry => entry.video.id === without.video.id);
  assert.deepEqual(linked.offers, [{ offer_id: created.body.id, status: 'published', price_sats: 5000, created_at: 1000 }]);
  assert.deepEqual(bare.offers, []);
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

test('discovery returns only published offers and never the unrestricted original', async () => {
  const { content, service, offers } = setup();
  const { video } = await upload(content, creator);
  const draft = await service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1', body: {
    video_id: video.id, title: 'Mountain view', description: 'A drone pass', brand: 'Acme', amount_sats: 5000,
    usage_rights: 'Social use', duration: { type: 'fixed', days: 30 } } });
  const published = { ...draft.body, status: 'published' };
  offers.set(published.id, published);
  // Draft, publishing and licensed offers are not purchasable and are not listed.
  const other = await service.create({ pubkey: creator, key: 'offer-key-0002', digest: 'o2', body: {
    video_id: video.id, brand: 'Acme', amount_sats: 1, usage_rights: 'x', duration: { type: 'perpetual' } } });
  offers.set(other.body.id, { ...other.body, status: 'licensed' });
  offers.set('draft-only', { ...other.body, id: 'draft-only', status: 'draft' });

  const { status, body } = await service.discover();
  assert.equal(status, 200);
  assert.equal(body.offers.length, 1);
  const [listing] = body.offers;
  assert.equal(listing.offer_id, published.id);
  assert.equal(listing.video_id, video.id);
  assert.equal(listing.title, 'Mountain view');
  assert.equal(listing.price_sats, 5000);
  assert.equal(listing.creator_public_key, creator);
  assert.deepEqual(listing.license_duration, { type: 'fixed', days: 30 });
  assert.equal(listing.duration_seconds, 45);
  // Watermarked preview and a server-built thumbnail, never the original.
  assert.ok(listing.preview_url.includes('l_text:'));
  assert.ok(listing.thumbnail_url.includes('f_jpg'));
  const serialised = JSON.stringify(listing);
  assert.equal(serialised.includes(SECRET), false);
  assert.equal(listing.original_url, undefined);
  // The unrestricted original delivery URL must not appear anywhere in the
  // brand-facing projection.
  assert.equal(serialised.includes(originalUrl(mediaRef(video))), false);
  // A discovery listing satisfies the published contract projection.
  const { validate } = await import('../src/validators/validation.js');
  validate('DiscoveryListing', listing);
  validate('Discovery', body);
});

test('discovery falls back to the offer content reference when no video is linked', async () => {
  const { service, offers } = setup();
  const created = await service.create({ pubkey: creator, key: 'offer-key-0001', digest: 'o1', body: {
    brand: 'Acme', content_url: 'https://cdn.example.com/preview.jpg', content_sha256: '0'.repeat(64),
    amount_sats: 250, usage_rights: 'Social use', duration: { type: 'perpetual' } } });
  offers.set(created.body.id, { ...created.body, status: 'published' });
  const { body } = await service.discover();
  assert.equal(body.offers[0].preview_url, 'https://cdn.example.com/preview.jpg');
  assert.equal(body.offers[0].thumbnail_url, null);
  assert.equal(body.offers[0].video_id, null);
});

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

test('video routes require authentication and enforce ownership over HTTP', async () => {
  const { service, content } = setup();
  const app = createApp({ service, contentService: content, verifyEvent: () => true, origin: 'http://localhost:3000', now: () => 1000 });
  const inject = (url, method, headers = {}, payload = '') => new Promise(resolve => {
    const request = Readable.from(payload ? [Buffer.from(payload)] : []);
    Object.assign(request, { url, method, headers });
    let status;
    app.emit('request', request, { setHeader() {}, writeHead(code) { status = code; }, end(body) { resolve({ status, body: JSON.parse(body) }); } });
  });
  const auth = (url, method, key) => {
    const event = { id: 'a'.repeat(64), pubkey: creator, created_at: 1000, kind: 27235, content: '', sig: 'b'.repeat(128), tags: [['u', url], ['method', method]] };
    return 'Nostr ' + Buffer.from(JSON.stringify(event)).toString('base64');
  };
  const { video } = await upload(content, creator);

  assert.equal((await inject('/api/videos', 'GET')).status, 401);
  assert.equal((await inject('/api/videos', 'GET', { authorization: auth('http://localhost:3000/api/videos', 'GET') })).status, 200);
  assert.equal((await inject(`/api/videos/${video.id}`, 'GET', { authorization: auth(`http://localhost:3000/api/videos/${video.id}`, 'GET') })).status, 200);
  // An unauthenticated POST cannot create an upload authorisation.
  assert.equal((await inject('/api/videos/upload-authorization', 'POST', { 'content-type': 'application/json', 'idempotency-key': 'upload-key-000001' }, '{}')).status, 401);
  assert.equal(matchVideoRoute('GET', '/api/videos').action, 'listMine');
  assert.equal(matchVideoRoute('DELETE', `/api/videos/${video.id}`).action, 'remove');
  assert.equal(matchVideoRoute('GET', '/api/videos/a/b'), null);
  app.close();
});

test('discovery is public, video reads are private, and the content layer degrades cleanly when absent', async () => {
  const { service } = setup();
  const app = createApp({ service, verifyEvent: () => true, origin: 'http://localhost:3000', now: () => 1000 });
  const inject = (url, headers = {}) => new Promise(resolve => {
    const request = Readable.from([]);
    Object.assign(request, { url, method: 'GET', headers });
    let status;
    app.emit('request', request, { setHeader() {}, writeHead(code) { status = code; }, end(body) { resolve({ status, body: JSON.parse(body) }); } });
  });
  const authorization = url => {
    const event = { id: 'a'.repeat(64), pubkey: creator, created_at: 1000, kind: 27235, content: '', sig: 'b'.repeat(128), tags: [['u', url], ['method', 'GET']] };
    return 'Nostr ' + Buffer.from(JSON.stringify(event)).toString('base64');
  };
  // Discovery needs no credentials.
  assert.deepEqual((await inject('/api/offers')).body, { offers: [] });
  // A video read is never public, and reports the missing layer only once the caller authenticates.
  assert.equal((await inject('/api/videos')).status, 401);
  assert.equal((await inject('/api/videos', { authorization: authorization('http://localhost:3000/api/videos') })).status, 501);
  app.close();
});
