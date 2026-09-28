import { createHash } from 'node:crypto';
import { validate } from '../validators/validation.js';
import { HttpError } from '../utils/errors.js';
export const sha256 = value => createHash('sha256').update(value).digest('hex');

// Injected verifier is nostr-tools/pure.verifyEvent in the production server.
export function authenticate({ authorization, method, url, rawBody, idempotencyKey, verifyEvent, now }) {
  try {
    if (typeof authorization !== 'string' || !authorization.startsWith('Nostr ')) throw new Error();
    const encoded = authorization.slice(6);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    const event = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    validate('SignedEvent', event);
    if (!verifyEvent(event) || event.kind !== 27235 || event.content !== '' || Math.abs(now - event.created_at) > 60) throw new Error();
    const tag = name => {
      const entries = event.tags.filter(t => t[0] === name);
      if (entries.length !== 1 || entries[0].length !== 2) throw new Error();
      return entries[0][1];
    };
    if (tag('u') !== url || tag('method') !== method) throw new Error();
    if (method === 'POST') {
      if (tag('payload') !== sha256(rawBody) || tag('contentport-idempotency-key') !== idempotencyKey) throw new Error();
    }
    return event.pubkey;
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'A valid signed Nostr HTTP authorization event is required.');
  }
}
