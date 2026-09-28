export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

type UnsignedNostrEvent = Omit<NostrEvent, "id" | "sig">;

interface NostrExtension {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<NostrEvent>;
}

declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

function signer(): NostrExtension {
  if (typeof window === "undefined" || !window.nostr) {
    throw new Error("A NIP-07 Nostr signer is required to publish an offer. Install and unlock a Nostr browser extension, then try again.");
  }
  return window.nostr;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function signHttpAuthorization({
  method,
  url,
  body = "",
  idempotencyKey,
}: {
  method: "GET" | "POST";
  url: string;
  body?: string;
  idempotencyKey?: string;
}): Promise<string> {
  const tags: string[][] = [["u", url], ["method", method]];
  if (method === "POST") {
    if (!idempotencyKey) throw new Error("An idempotency key is required for POST requests.");
    tags.push(["payload", await sha256Hex(body)]);
    tags.push(["contentport-idempotency-key", idempotencyKey]);
  }
  const event = await signer().signEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
    pubkey: await signer().getPublicKey(),
  });
  return `Nostr ${base64(JSON.stringify(event))}`;
}

export async function signOfferEvent({
  kind,
  terms,
  attestorPubkey,
}: {
  kind: number;
  terms: Record<string, unknown>;
  attestorPubkey: string;
}): Promise<NostrEvent> {
  if (!/^[0-9a-f]{64}$/.test(attestorPubkey)) {
    throw new Error("NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY must be the backend attestor's 64-character lowercase hexadecimal public key.");
  }
  return signer().signEvent({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "contentport-offer-v1"]],
    content: JSON.stringify({
      schema: "contentport.offer.v1",
      terms,
      attestor_pubkey: attestorPubkey,
    }),
    pubkey: await signer().getPublicKey(),
  });
}
