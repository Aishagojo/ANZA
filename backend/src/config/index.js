import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools/pure';
import { decrypt as decryptNcryptsec } from 'nostr-tools/nip49';

function readAttestorPubkey(value) {
  const input = String(value || '').trim();
  if (/^[0-9a-f]{64}$/.test(input)) return input;
  try {
    const decoded = nip19.decode(input);
    if (decoded.type === 'npub' && /^[0-9a-f]{64}$/.test(decoded.data)) return decoded.data;
  } catch { /* The value is neither an npub nor a raw public key. */ }
  throw new Error('NOSTR_ATTESTOR_PUBKEY must be a raw 64-character hex key or an npub');
}

function readAttestorSecretKey(env, attestorPubkey) {
  const encrypted = String(env.NOSTR_ATTESTOR_PRIVATE_KEY || '').trim();
  if (!encrypted) return null;
  const password = String(env.NOSTR_ATTESTOR_PASSWORD || '');
  let secretKey;
  try {
    if (encrypted.startsWith('ncryptsec1')) {
      if (!password) return null;
      secretKey = decryptNcryptsec(encrypted, password);
    } else if (encrypted.startsWith('nsec1')) {
      const decoded = nip19.decode(encrypted);
      if (decoded.type !== 'nsec') throw new Error('Expected an nsec key');
      secretKey = decoded.data;
    } else {
      throw new Error('Expected an ncryptsec or nsec key');
    }
  } catch {
    throw new Error('Could not unlock NOSTR_ATTESTOR_PRIVATE_KEY. Check the key and NOSTR_ATTESTOR_PASSWORD.');
  }
  if (getPublicKey(secretKey) !== attestorPubkey) {
    throw new Error('Unlocked NOSTR attestor key does not match NOSTR_ATTESTOR_PUBKEY.');
  }
  return secretKey;
}

function readLndUrl(value) {
  const url = new URL(value || 'https://127.0.0.1:8081');
  if (url.protocol !== 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LND_REST_URL must be an HTTPS localhost origin from Polar.');
  }
  return url.origin;
}

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const kind = Number(env.NOSTR_OFFER_KIND);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.NOSTR_OFFER_KIND || !Number.isInteger(kind) || kind < 1000 || kind >= 10000) throw new Error('NOSTR_OFFER_KIND must be an explicitly selected regular kind (1000..9999)');
  const attestorPubkey = readAttestorPubkey(env.NOSTR_ATTESTOR_PUBKEY);
  const attestorSecretKey = readAttestorSecretKey(env, attestorPubkey);
  const origin = new URL(env.PUBLIC_ORIGIN || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.href !== `${origin.origin}/`) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without path or credentials');
  const relays = [...new Set((env.NOSTR_RELAYS || '').split(',').map(x => x.trim()).filter(Boolean))];
  if (!relays.length) throw new Error('NOSTR_RELAYS is required');
  for (const relay of relays) {
    const url = new URL(relay);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'wss:' && !(local && url.protocol === 'ws:')) || url.username || url.password || url.hash) throw new Error('Relays must use wss://, or ws:// on localhost');
  }
  const corsOrigin = env.CORS_ORIGIN ? new URL(env.CORS_ORIGIN).origin : null;
  return { host: env.HOST || '127.0.0.1', port, origin: origin.origin, corsOrigin, databaseUrl: env.DATABASE_URL,
    kind, attestorPubkey, attestorSecretKey, relays, lndRestUrl: readLndUrl(env.LND_REST_URL), lndMacaroon: env.LND_MACAROON?.trim() || null };
}
