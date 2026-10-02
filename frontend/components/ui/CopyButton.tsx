"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Used for "Copy Invoice" on the payment page (spec section 15). */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in unsupported contexts (e.g. non-HTTPS) —
      // fail silently rather than throwing in front of the user.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
    >
      {copied ? (
        <>
          <Check size={14} className="text-success" /> Copied ✓
        </>
      ) : (
        <>
          <Copy size={14} /> {label}
        </>
      )}
    </button>
  );
}
