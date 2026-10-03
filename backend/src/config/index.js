import { decode } from 'nostr-tools/nip19';

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const kind = Number(env.NOSTR_OFFER_KIND);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.NOSTR_OFFER_KIND || !Number.isInteger(kind) || kind < 1000 || kind >= 10000) {
    throw new Error('NOSTR_OFFER_KIND must be an explicitly selected regular kind (1000..9999)');
  }
  if (!env.NOSTR_ATTESTOR_PUBKEY) throw new Error('NOSTR_ATTESTOR_PUBKEY is required');
  let attestorPubkey = env.NOSTR_ATTESTOR_PUBKEY;
  if (attestorPubkey.startsWith('npub1')) {
    try {
      const decoded = decode(attestorPubkey);
      if (decoded.type !== 'npub') throw new Error('Invalid public key type');
      attestorPubkey = decoded.data;
    } catch {
      throw new Error('NOSTR_ATTESTOR_PUBKEY must be a valid npub or exactly 64 lowercase hexadecimal characters');
    }
  }
  if (!/^[0-9a-f]{64}$/.test(attestorPubkey)) {
    throw new Error('NOSTR_ATTESTOR_PUBKEY must be a valid npub or exactly 64 lowercase hexadecimal characters');
  }
  const origin = new URL(env.PUBLIC_ORIGIN || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.href !== `${origin.origin}/`) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without path or credentials');
  }
  const relays = [...new Set((env.NOSTR_RELAYS || '').split(',').map(x => x.trim()).filter(Boolean))];
  if (!relays.length) throw new Error('NOSTR_RELAYS is required');
  for (const relay of relays) {
    const url = new URL(relay);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'wss:' && !(local && url.protocol === 'ws:')) || url.username || url.password || url.hash) {
      throw new Error('Relays must use wss://, or ws:// on localhost');
    }
  }
  const corsOrigin = env.CORS_ORIGIN ? new URL(env.CORS_ORIGIN).origin : null;
  return { host: env.HOST || '127.0.0.1', port, origin: origin.origin, corsOrigin,
    databaseUrl: env.DATABASE_URL, kind, attestorPubkey, relays };
}
