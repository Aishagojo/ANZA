import { CreateOfferPayload, CreateOfferResponse, LicenseIssuance, Offer, OfferLicense, OfferStatusResponse, PaymentRequestResponse } from "./types";
import { LICENSE_TYPE_DESCRIPTIONS, LICENSE_TYPE_LABELS } from "./licenseTypes";
import { sha256Hex, signHttpAuthorization, signOfferEvent } from "./nostr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

type BackendOffer = {
  id: string;
  creator_pubkey: string;
  terms: {
    title?: string; description?: string; brand: string; content_url: string;
    content_sha256: string; amount_sats: number; usage_rights: string;
    duration: { type: "fixed"; days: number } | { type: "perpetual" };
  };
  status: "draft" | "publishing" | "published" | "licensed";
  event_id: string | null;
  payment?: { status?: "pending" | "settled" };
  license?: OfferLicense;
  license_issuance?: LicenseIssuance;
};

function idempotencyKey() { return crypto.randomUUID().replaceAll("-", ""); }
function apiUrl(path: string) { return `${API_BASE_URL.replace(/\/$/, "")}${path}`; }
async function errorMessage(response: Response): Promise<string> {
  try { return (await response.json())?.error?.message ?? "The request could not be completed."; }
  catch { return "The request could not be completed."; }
}
async function signedRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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
function termsFrom(payload: CreateOfferPayload) {
  const duration = payload.licenseType === "PERPETUAL" ? { type: "perpetual" as const }
    : { type: "fixed" as const, days: payload.licenseType === "30_DAY_SOCIAL" ? 30 : 90 };
  return { title: payload.title.trim(), description: payload.description.trim(), brand: payload.brandName.trim(),
    content_url: payload.contentUrl.trim(), content_sha256: "", amount_sats: payload.priceSats,
    usage_rights: payload.licenseDescription.trim(), duration };
}
function licenseType(duration: BackendOffer["terms"]["duration"]): Offer["licenseType"] {
  if (duration.type === "perpetual") return "PERPETUAL";
  return duration.days <= 30 ? "30_DAY_SOCIAL" : "90_DAY_COMMERCIAL";
}
function fromBackend(offer: BackendOffer): Offer {
  const type = licenseType(offer.terms.duration);
  return { offerId: offer.id, title: offer.terms.title || "Untitled Content", description: offer.terms.description || offer.terms.usage_rights,
    contentUrl: offer.terms.content_url, brandName: offer.terms.brand, priceSats: offer.terms.amount_sats,
    licenseType: type, licenseDescription: offer.terms.usage_rights,
    status: offer.status === "licensed" ? "LICENSED" : offer.payment?.status === "settled" ? "PAYMENT_SETTLED" : offer.payment?.status === "pending" ? "PAYMENT_PENDING" : "OPEN",
    // Both are omitted rather than defaulted: the licensed screen only claims a
    // Nostr record when the backend actually returned one.
    ...(offer.license ? { license: offer.license } : {}),
    ...(offer.license_issuance ? { licenseIssuance: offer.license_issuance } : {}),
    nostrEventId: offer.event_id ?? "Pending relay acknowledgement",
    creatorHandle: `${offer.creator_pubkey.slice(0, 8)}…${offer.creator_pubkey.slice(-6)}` };
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
  const terms = termsFrom(payload);
  // Original media upload is a later feature. The public content reference is fingerprinted for this MVP.
  terms.content_sha256 = await sha256Hex(terms.content_url);
  const draft = await signedRequest<BackendOffer>("POST", "/offers", terms);
  const event = await signOfferEvent({ kind: Number(process.env.NEXT_PUBLIC_NOSTR_OFFER_KIND ?? "9998"), terms,
    attestorPubkey: process.env.NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY ?? "" });
  await signedRequest<BackendOffer>("POST", `/offers/${draft.id}/publish`, event);
  const published = await waitForPublication(draft.id);
  return { offerId: published.id, status: "OPEN", nostrEventId: published.event_id ?? event.id, publicUrl: `/offers/${published.id}` };
}
export async function getOffer(offerId: string): Promise<Offer> {
  const response = await fetch(apiUrl(`/offers/${offerId}`));
  if (!response.ok) throw new Error(await errorMessage(response));
  return fromBackend(await response.json() as BackendOffer);
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
