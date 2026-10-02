import { Clock, ShieldCheck } from "lucide-react";

/**
 * Spec section 13 — Nostr Verification Section.
 *
 * `eventId` is nullable, and the two states look different on purpose. The
 * green verified treatment asserts that a relay accepted the event; there is
 * nothing to assert until an event id exists, so the pending state is shown
 * neutrally and prints no id at all. A caller that passed a placeholder string
 * would previously have had it sliced and rendered as if it were an event id.
 */
export function VerificationCard({
  eventId,
  label = "Verified on Nostr",
}: {
  eventId: string | null;
  label?: string;
}) {
  if (!eventId) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <Clock size={18} className="mt-0.5 shrink-0 text-text-secondary" />
        <div>
          <p className="text-sm font-medium text-text-primary">
            Awaiting relay acknowledgement
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            This offer has been queued for Nostr. No event id has been assigned
            yet, so there is nothing to verify.
          </p>
        </div>
      </div>
    );
  }

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