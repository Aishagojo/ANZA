/**
 * ============================================================================
 * API LAYER — READ THIS FIRST, BACKEND TEAM
 * ============================================================================
 *
 * Every screen in this app calls the four functions below instead of using
 * `fetch` directly. That means going from "mock" to "real" is a change in
 * ONE file — nothing in /app or /components needs to be touched.
 *
 * Each function currently:
 *   1. Reads/writes a fake "database" kept in the browser's localStorage
 *      (see mockStore below), so the demo flow works end-to-end without
 *      a backend.
 *   2. Has the REAL fetch call written out in a comment directly above it,
 *      matching the exact request/response contract from the spec
 *      (sections 13, 14, 15, 16).
 *
 * TO SWITCH TO THE REAL BACKEND:
 *   - Set NEXT_PUBLIC_USE_MOCK_API=false in .env.local
 *   - Set NEXT_PUBLIC_API_BASE_URL to your API's base URL
 *   - Delete (or ignore) the mock branch in each function below — the real
 *     fetch branch is already written and typed correctly.
 *
 * Nothing else changes. Please keep this file as the ONLY place that knows
 * whether we're mocked or real.
 * ============================================================================
 */

import {
  CreateOfferPayload,
  CreateOfferResponse,
  Offer,
  OfferStatusResponse,
  PaymentRequestResponse,
} from "./types";
import { LICENSE_TYPE_DESCRIPTIONS, LICENSE_TYPE_LABELS } from "./licenseTypes";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

// ---------------------------------------------------------------------------
// Mock "database" — a thin localStorage wrapper standing in for the real
// offers/payments/licenses tables described in spec section 19.
// Safe to delete entirely once USE_MOCK is false.
// ---------------------------------------------------------------------------
const STORAGE_KEY = "contentport_mock_offers";

function readMockOffers(): Record<string, Offer> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeMockOffers(offers: Record<string, Offer>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
}

function fakeLatency<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function generateId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// 1. Create an offer
// ---------------------------------------------------------------------------
//
// REAL CALL (spec section 13):
//
// const res = await fetch(`${API_BASE_URL}/offers`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify(payload),
// });
// if (!res.ok) throw new Error("Failed to create offer");
// return (await res.json()) as CreateOfferResponse;
//
export async function createOffer(
  payload: CreateOfferPayload
): Promise<CreateOfferResponse> {
  if (!USE_MOCK) {
    const res = await fetch(`${API_BASE_URL}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create offer");
    return (await res.json()) as CreateOfferResponse;
  }

  // ---- mock branch ----
  const offerId = generateId("");
  const nostrEventId = `nevent1${generateId("")}${generateId("")}`;
  const offer: Offer = {
    offerId,
    title: payload.title,
    description: payload.description,
    contentUrl: payload.contentUrl,
    brandName: payload.brandName,
    priceSats: payload.priceSats,
    licenseType: payload.licenseType,
    licenseDescription: payload.licenseDescription,
    status: "OPEN",
    nostrEventId,
    creatorHandle: "@creator",
  };
  const offers = readMockOffers();
  offers[offerId] = offer;
  writeMockOffers(offers);

  return fakeLatency({
    offerId,
    status: "OPEN",
    nostrEventId,
    publicUrl: `/offers/${offerId}`,
  });
}

// ---------------------------------------------------------------------------
// 2. Fetch a single offer (public offer page + licensed confirmation page)
// ---------------------------------------------------------------------------
//
// REAL CALL (spec section 14):
//
// const res = await fetch(`${API_BASE_URL}/offers/${offerId}`);
// if (!res.ok) throw new Error("Offer not found");
// return (await res.json()) as Offer;
//
export async function getOffer(offerId: string): Promise<Offer> {
  if (!USE_MOCK) {
    const res = await fetch(`${API_BASE_URL}/offers/${offerId}`);
    if (!res.ok) throw new Error("Offer not found");
    return (await res.json()) as Offer;
  }

  // ---- mock branch ----
  const offers = readMockOffers();
  const offer = offers[offerId];
  if (!offer) throw new Error("Offer not found");
  return fakeLatency(offer, 400);
}

// ---------------------------------------------------------------------------
// 3. Create a Lightning payment request for an offer
// ---------------------------------------------------------------------------
//
// REAL CALL (spec section 15):
//
// const res = await fetch(`${API_BASE_URL}/offers/${offerId}/payment`, {
//   method: "POST",
// });
// if (!res.ok) throw new Error("Failed to create payment request");
// return (await res.json()) as PaymentRequestResponse;
//
export async function createPaymentRequest(
  offerId: string
): Promise<PaymentRequestResponse> {
  if (!USE_MOCK) {
    const res = await fetch(`${API_BASE_URL}/offers/${offerId}/payment`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to create payment request");
    return (await res.json()) as PaymentRequestResponse;
  }

  // ---- mock branch ----
  const offers = readMockOffers();
  const offer = offers[offerId];
  if (!offer) throw new Error("Offer not found");

  offer.status = "PAYMENT_PENDING";
  offers[offerId] = offer;
  writeMockOffers(offers);

  // Fake invoice string — visually resembles a real "lnbc..." Lightning invoice.
  const fakeInvoice = `lnbc${offer.priceSats}n1p${generateId("")}${generateId(
    ""
  )}${generateId("")}`;

  return fakeLatency(
    { offerId, amountSats: offer.priceSats, paymentRequest: fakeInvoice },
    400
  );
}

// ---------------------------------------------------------------------------
// 4. Poll payment/license status
// ---------------------------------------------------------------------------
//
// REAL CALL (spec section 16/17 — poll or swap for SSE/WebSocket if the
// backend supports it):
//
// const res = await fetch(`${API_BASE_URL}/offers/${offerId}/status`);
// if (!res.ok) throw new Error("Failed to fetch status");
// return (await res.json()) as OfferStatusResponse;
//
// IMPORTANT (spec section 16): the frontend NEVER marks a payment as
// successful on its own — it only reflects what this endpoint returns.
//
export async function getOfferStatus(
  offerId: string
): Promise<OfferStatusResponse> {
  if (!USE_MOCK) {
    const res = await fetch(`${API_BASE_URL}/offers/${offerId}/status`);
    if (!res.ok) throw new Error("Failed to fetch status");
    return (await res.json()) as OfferStatusResponse;
  }

  // ---- mock branch ----
  // Simulates a Lightning payment being confirmed ~4 seconds after the
  // invoice was created, purely so the demo flow completes on its own.
  const offers = readMockOffers();
  const offer = offers[offerId];
  if (!offer) throw new Error("Offer not found");

  if (offer.status === "PAYMENT_PENDING") {
    const licenseNostrEventId = `nevent1${generateId("")}${generateId("")}`;
    offer.status = "LICENSED";
    offer.licensedAt = new Date().toISOString();
    offer.licenseNostrEventId = licenseNostrEventId;
    offers[offerId] = offer;
    writeMockOffers(offers);
  }

  return fakeLatency(
    {
      offerId,
      status: offer.status,
      licenseNostrEventId: offer.licenseNostrEventId,
      licensedAt: offer.licensedAt,
    },
    1200
  );
}

// Re-exported so components can render human-readable license copy
// without importing licenseTypes.ts directly everywhere.
export { LICENSE_TYPE_LABELS, LICENSE_TYPE_DESCRIPTIONS };
