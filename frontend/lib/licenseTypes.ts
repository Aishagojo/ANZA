import { LicenseType } from "./types";

/**
 * Single source of truth for license type copy (spec section 21 — License Types).
 * The creator form auto-fills the license description from this map when the
 * dropdown changes, and the creator can still hand-edit the text afterwards.
 *
 * BACKEND TEAM: if the license "engine" becomes dynamic later (custom terms,
 * per-brand pricing, etc.), this file is the only place that needs to grow —
 * every screen reads from LICENSE_TYPE_LABELS / LICENSE_TYPE_DESCRIPTIONS.
 */
export const LICENSE_TYPE_OPTIONS: LicenseType[] = [
  "30_DAY_SOCIAL",
  "90_DAY_COMMERCIAL",
  "PERPETUAL",
];

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  "30_DAY_SOCIAL": "30-Day Social",
  "90_DAY_COMMERCIAL": "90-Day Commercial",
  PERPETUAL: "Perpetual",
};

export const LICENSE_TYPE_DESCRIPTIONS: Record<LicenseType, string> = {
  "30_DAY_SOCIAL":
    "Allows the brand to publish the content on its social media channels for 30 days.",
  "90_DAY_COMMERCIAL":
    "Allows the brand to use the content across commercial channels for 90 days.",
  PERPETUAL:
    "Grants the brand perpetual usage rights to the content across all channels.",
};
