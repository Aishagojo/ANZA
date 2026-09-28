import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

/**
 * Spec section 16 — Payment State.
 *
 * IMPORTANT: `confirmed` must only ever be set to true after
 * lib/api.getOfferStatus() reports status === "LICENSED". Never flip this
 * to true just because the user clicked something on this page — the whole
 * point of the product is that the backend, not the UI, is the source of
 * truth for payment success.
 */
export function PaymentStatus({
  confirmed,
  offerId,
}: {
  confirmed: boolean;
  offerId: string;
}) {
  if (confirmed) {
    return (
      <div className="rounded-lg bg-success-bg p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle size={16} /> Payment received
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          License recorded successfully.
        </p>
        <Link href={`/offers/${offerId}`} className="mt-3 block">
          <Button fullWidth>View License →</Button>
        </Link>
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
