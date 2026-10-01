import {
  CreateOfferPayload,
  CreateOfferResponse,
  DiscoveryListing,
  Offer,
  OfferStatusResponse,
  OwnedVideo,
  PaymentRequestResponse,
  UploadAuthorization,
  VideoRegistrationInput,
  VideoRecord,
} from "./types";
import { LICENSE_TYPE_DESCRIPTIONS, LICENSE_TYPE_LABELS } from "./licenseTypes";
import { sha256Hex, signHttpAuthorization, signOfferEvent } from "./nostr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

type Method = "GET" | "POST" | "DELETE";

type LicenseDuration =
  | { type: "fixed"; days: number }
  | { type: "perpetual" };

type BackendOffer = {
  id: string;
  creator_pubkey: string;
  terms: {
    title?: string; description?: string; brand: string; content_url: string;
    content_sha256: string; amount_sats: number; usage_rights: string;
    duration: LicenseDuration;
  };
  status: "draft" | "publishing" | "published" | "licensed";
  event_id: string | null;
  video_id?: string;
  payment?: { status?: "pending" | "settled"; settled_at?: number };
};

function idempotencyKey() { return crypto.randomUUID().replaceAll("-", ""); }
function apiUrl(path: string) { return `${API_BASE_URL.replace(/\/$/, "")}${path}`; }
async function errorMessage(response: Response): Promise<string> {
  try { return (await response.json())?.error?.message ?? "The request could not be completed."; }
  catch { return "The request could not be completed."; }
}
async function signedRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const url = apiUrl(path);
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const key = method === "POST" ? idempotencyKey() : undefined;
  const authorization = await signHttpAuthorization({ method, url, body: rawBody, idempotencyKey: key });
  const response = await fetch(url, {
    method,
    headers: { Authorization: authorization, ...(key ? { "Idempotency-Key": key, "Content-Type": "application/json" } : {}) },
    ...(method === "POST" ? { body: rawBody } : {}),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<T>;
}
function licenseDuration(payload: CreateOfferPayload): LicenseDuration {
  return payload.licenseType === "PERPETUAL" ? { type: "perpetual" }
    : { type: "fixed", days: payload.licenseType === "30_DAY_SOCIAL" ? 30 : 90 };
}
export function licenseType(duration: LicenseDuration): Offer["licenseType"] {
  if (duration.type === "perpetual") return "PERPETUAL";
  return duration.days <= 30 ? "30_DAY_SOCIAL" : "90_DAY_COMMERCIAL";
}
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "--:--";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
// The backend derives the same shape, so creators are identified the same way
// everywhere. There is no profile resolver to resolve a display name from.
export const creatorHandle = (pubkey: string) =>
  `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;

/**
 * Builds the POST /offers body. With a videoId the server resolves the canonical
 * media reference and fingerprint itself, so no content reference is sent. Without
 * one the browser must supply both fields, and there is nothing else to fingerprint.
 */
async function offerDraftFrom(payload: CreateOfferPayload) {
  const base = {
    title: payload.title.trim(), description: payload.description.trim(),
    brand: payload.brandName.trim(), amount_sats: payload.priceSats,
    usage_rights: payload.licenseDescription.trim(), duration: licenseDuration(payload),
  };
  if (payload.videoId) return { ...base, video_id: payload.videoId };
  const content_url = payload.contentUrl.trim();
  return { ...base, content_url, content_sha256: await sha256Hex(content_url) };
}
function fromBackend(offer: BackendOffer): Offer {
  const type = licenseType(offer.terms.duration);
  return { offerId: offer.id, title: offer.terms.title || "Untitled Content", description: offer.terms.description || offer.terms.usage_rights,
    contentUrl: offer.terms.content_url, brandName: offer.terms.brand, priceSats: offer.terms.amount_sats,
    licenseType: type, licenseDescription: offer.terms.usage_rights,
    status: offer.status === "licensed" ? "LICENSED" : offer.payment?.status === "settled" ? "PAYMENT_SETTLED" : offer.payment?.status === "pending" ? "PAYMENT_PENDING" : "OPEN",
    nostrEventId: offer.event_id ?? "Pending relay acknowledgement",
    ...(offer.payment?.settled_at ? { paymentSettledAt: offer.payment.settled_at } : {}),
    creatorHandle: creatorHandle(offer.creator_pubkey) };
}
async function waitForPublication(offerId: string): Promise<BackendOffer> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const offer = await signedRequest<BackendOffer>("GET", `/offers/${offerId}`);
    if (offer.status === "published") return offer;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Your offer was queued but the relay has not acknowledged it yet. Please try again shortly.");
}
export async function createOffer(payload: CreateOfferPayload): Promise<CreateOfferResponse> {
  const draft = await signedRequest<BackendOffer>("POST", "/offers", await offerDraftFrom(payload));
  // Sign the terms the SERVER resolved, not a local reconstruction. For a
  // video-backed offer the backend replaced the content reference and
  // fingerprint, and a mismatched event is rejected at publish with 400.
  const event = await signOfferEvent({ kind: Number(process.env.NEXT_PUBLIC_NOSTR_OFFER_KIND ?? "9998"),
    terms: draft.terms, attestorPubkey: process.env.NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY ?? "" });
  await signedRequest<BackendOffer>("POST", `/offers/${draft.id}/publish`, event);
  const published = await waitForPublication(draft.id);
  return { offerId: published.id, status: "OPEN", nostrEventId: published.event_id ?? event.id, publicUrl: `/offers/${published.id}` };
}

/**
 * Publishes an offer that already exists as a draft, using the terms the server
 * already stored. The creator never re-enters terms they have already submitted,
 * and the signature covers the stored terms rather than a local copy.
 */
export async function publishOffer(offerId: string): Promise<CreateOfferResponse> {
  const draft = await signedRequest<BackendOffer>("GET", `/offers/${offerId}`);
  const event = await signOfferEvent({ kind: Number(process.env.NEXT_PUBLIC_NOSTR_OFFER_KIND ?? "9998"),
    terms: draft.terms, attestorPubkey: process.env.NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY ?? "" });
  await signedRequest<BackendOffer>("POST", `/offers/${offerId}/publish`, event);
  const published = await waitForPublication(offerId);
  return { offerId: published.id, status: "OPEN", nostrEventId: published.event_id ?? event.id, publicUrl: `/offers/${published.id}` };
}

// ---------------------------------------------------------------------------
// Content layer. Every call below is authenticated with the creator's Nostr
// signer; the backend derives the owner from that signature, so no creator key
// is ever sent from the browser.
// ---------------------------------------------------------------------------

/** Authorises one direct browser-to-Cloudinary upload. */
export function authorizeUpload(): Promise<UploadAuthorization> {
  return signedRequest<UploadAuthorization>("POST", "/videos/upload-authorization");
}

/** Registers an asset the browser already uploaded, and returns the stored record. */
export function registerVideo(input: VideoRegistrationInput): Promise<OwnedVideo> {
  return signedRequest<OwnedVideo>("POST", "/videos", input);
}

/** The authenticated creator's own videos, each with its authoritative offers. */
export async function listMyVideos(): Promise<OwnedVideo[]> {
  return (await signedRequest<{ videos: OwnedVideo[] }>("GET", "/videos")).videos;
}

export async function getMyVideo(videoId: string): Promise<OwnedVideo> {
  return signedRequest<OwnedVideo>("GET", `/videos/${videoId}`);
}

/** Deletes an owned video that no offer references. */
export function deleteVideo(videoId: string): Promise<{ id: string; deleted: true }> {
  return signedRequest("DELETE", `/videos/${videoId}`);
}

/** Brand discovery. Public: needs no credentials. */
export async function discoverOffers(): Promise<DiscoveryListing[]> {
  const response = await fetch(apiUrl("/offers"));
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json() as { offers: DiscoveryListing[] }).offers;
}
export async function getOffer(offerId: string): Promise<Offer> {
  const response = await fetch(apiUrl(`/offers/${offerId}`));
  if (!response.ok) throw new Error(await errorMessage(response));
  return fromBackend(await response.json() as BackendOffer);
}

/**
 * Reads an offer with the creator's signature. Required for a draft, which is
 * private to its owner until the licensing engine publishes it.
 */
export function getMyOffer(offerId: string): Promise<Offer> {
  return signedRequest<BackendOffer>("GET", `/offers/${offerId}`).then(fromBackend);
}
export async function createPaymentRequest(offerId: string): Promise<PaymentRequestResponse> {
  const response = await fetch(apiUrl(`/offers/${offerId}/payment`), { method: "POST", headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<PaymentRequestResponse>;
}
export async function getOfferStatus(offerId: string): Promise<OfferStatusResponse> {
  const response = await fetch(apiUrl(`/offers/${offerId}/status`));
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<OfferStatusResponse>;
}
export { LICENSE_TYPE_LABELS, LICENSE_TYPE_DESCRIPTIONS };
