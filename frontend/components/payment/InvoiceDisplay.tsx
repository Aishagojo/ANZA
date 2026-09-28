import { CopyButton } from "@/components/ui/CopyButton";

/** Spec section 15 — Invoice: truncated string + "Copy Invoice" button. */
export function InvoiceDisplay({ paymentRequest }: { paymentRequest: string }) {
  const truncated = `${paymentRequest.slice(0, 24)}...${paymentRequest.slice(-6)}`;

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Lightning Invoice
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-2.5">
        <code className="truncate text-xs text-text-secondary">{truncated}</code>
        <CopyButton value={paymentRequest} label="Copy Invoice" />
      </div>
    </div>
  );
}
