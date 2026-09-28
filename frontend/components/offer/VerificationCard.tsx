import { ShieldCheck } from "lucide-react";

/**
 * Spec section 13 — Nostr Verification Section.
 * `eventId`: the offer's or the license's Nostr event id.
 * `label`: lets the same component say "Verified on Nostr" (offer page) or
 *          reuse the same visual style with a different heading elsewhere.
 */
export function VerificationCard({
  eventId,
  label = "Verified on Nostr",
}: {
  eventId: string;
  label?: string;
}) {
  const truncated = `${eventId.slice(0, 16)}...${eventId.slice(-6)}`;

  return (
    <div className="flex items-start gap-3 rounded-lg bg-success-bg px-4 py-3">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
      <div>
        <p className="text-sm font-medium text-success">{label}</p>
        <p className="mt-0.5 break-all text-xs text-text-secondary">
          Event: {truncated}
        </p>
      </div>
    </div>
  );
}
