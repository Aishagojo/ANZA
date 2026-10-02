import { CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

/**
 * The four states a buyer can be in on the pay page.
 *
 * Payment being confirmed and the license being recorded are deliberately
 * separate. Collapsing them means a buyer whose payment settled but whose
 * license could not be issued is told everything worked — the exact failure
 * this state machine exists to make visible.
 */
export type PaymentPhase =
  | "awaiting_payment"
  | "issuing_license"
  | "licensed"
  | "license_unavailable";

export function PaymentStatus({
  phase,
  offerId,
}: {
  phase: PaymentPhase;
  offerId: string;
}) {
  if (phase === "licensed") {
    return (
      <div className="rounded-lg bg-success-bg p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle size={16} /> Payment received
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Your license has been recorded on Nostr.
        </p>
        <Link href={`/offers/${offerId}`} className="mt-3 block">
<Button fullWidth>View License →</Button>
        </Link>
      </div>
    );
  }

  if (phase === "license_unavailable") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <AlertTriangle size={16} /> Payment received — license not issued
        </p>
        <p className="mt-1 text-sm text-amber-700">
          Your payment settled, but this deployment has no license signer
          configured, so no license record was produced. Your payment is not
          lost — please contact the creator with the offer link.
        </p>
        <Link href={`/offers/${offerId}`} className="mt-3 block">
          <Button fullWidth variant="secondary">
            View Offer →
          </Button>
        </Link>
      </div>
    );
  }

  if (phase === "issuing_license") {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-surface p-4">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-brand" />
        <div>
          <p className="text-sm font-medium text-text-primary">
            Payment received — issuing your license
          </p>
          <p className="text-xs text-text-secondary">
            Signing and publishing to Nostr. This updates automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface p-4">
      <Loader2 size={16} className="animate-spin text-brand" />
      <div>
        <p className="text-sm font-medium text-text-primary">Waiting for payment…</p>
        <p className="text-xs text-text-secondary">
          Payment will be confirmed automatically.
        </p>
      </div>
    </div>
  );
}
