import { finalizeEvent } from 'nostr-tools/pure';

/**
 * Adapts nostr-tools' finalizeEvent to the (template, secretKeyHex) signature
 * the offer service uses.
 *
 * finalizeEvent throws "expected Uint8Array, got type=string" if handed the
 * hex string that config deliberately produces, so the conversion has to happen
 * here. Doing it in config instead would leak a typed array through a config
 * layer that is otherwise plain strings.
 */
export function createAttestorSigner(finalize = finalizeEvent) {
  return function signAttestorEvent(template, secretKeyHex) {
    console.log('[SIGNER] Signing event', { kind: template.kind, eventId: template.id });
    if (typeof secretKeyHex !== 'string' || !/^[0-9a-f]{64}$/.test(secretKeyHex)) {
      throw new TypeError('Attestor secret key must be a 32-byte lowercase hex string.');
    }
    const event = finalize(template, Uint8Array.from(Buffer.from(secretKeyHex, 'hex')));
    console.log('[SIGNER] Event signed', { eventId: event.id, pubkey: event.pubkey });
    return event;
  };
}