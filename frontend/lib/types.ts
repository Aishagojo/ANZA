/**
 * Shared types for the whole app.
 *
 * BACKEND TEAM: these shapes are copied directly from the spec
 * (sections 10, 14, 15, 16). If your real API responds with different
 * field names, either update the backend to match this file, or update
 * this file and the two or three call sites in lib/api.ts — nothing else
 * in the UI should need to change, since every component reads these types.
 */

export type LicenseType = "30_DAY_SOCIAL" | "90_DAY_COMMERCIAL" | "PERPETUAL";

export type OfferStatus = "OPEN" | "PAYMENT_PENDING" | "PAYMENT_SETTLED" | "LICENSED";

/** Full offer record — response shape of GET /api/offers/:offerId */
export interface Offer {
  offerId: string;
  title: string;
  description: string;
  contentUrl: string;
  brandName: string;
  priceSats: number;
  licenseType: LicenseType;
  licenseDescription: string;
  status: OfferStatus;
  nostrEventId: string;
  creatorHandle: string;
  /** Only present once status === "LICENSED" */
  licensedAt?: string;
  /** Nostr event id of the license/payment confirmation event (kind: license_purchase) */
  licenseNostrEventId?: string;
  /** Unix timestamp from LND once the Lightning invoice settles. */
  paymentSettledAt?: number;
}

/** Body of POST /api/offers */
export interface CreateOfferPayload {
  title: string;
  description: string;
  contentUrl: string;
  brandName: string;
  priceSats: number;
  licenseType: LicenseType;
  licenseDescription: string;
}

/** Response of POST /api/offers */
export interface CreateOfferResponse {
  offerId: string;
  status: OfferStatus;
  nostrEventId: string;
  publicUrl: string;
}

/** Response of POST /api/offers/:offerId/payment */
export interface PaymentRequestResponse {
  offerId: string;
  amountSats: number;
  paymentRequest: string; // the raw "lnbc..." Lightning invoice string
}

/** Response of GET /api/offers/:offerId/status — used for polling on the pay page */
export interface OfferStatusResponse {
  offerId: string;
  status: OfferStatus;
  licenseNostrEventId?: string;
  licensedAt?: string;
  paymentSettledAt?: number;
}
