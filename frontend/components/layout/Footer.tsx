import { Radio, Zap } from "lucide-react";

/** Spec section 8 — Technology Section, shown at the bottom of the landing page. */
export function Footer() {
  return (
    <div className="border-t border-border bg-surface">
      <div className="mx-auto max-w-page px-6 py-10 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Powered by
        </p>
        <div className="flex items-center justify-center gap-6 text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1.5">
            <Radio size={16} className="text-brand" /> Nostr
          </span>
          <span className="text-text-secondary">+</span>
          <span className="flex items-center gap-1.5">
            <Zap size={16} className="text-bitcoin" /> Bitcoin Lightning
          </span>
        </div>
      </div>
    </div>
  );
}
