import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Shared wrapper: uppercase label (per spec section 5 — Labels) + optional
 * inline error message instead of a browser-default alert (spec section 9).
 */
function FieldShell({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-text-secondary">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </label>
  );
}

const fieldClasses =
  "w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}
export function Input({ label, error, hint, className = "", ...props }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <input className={`${fieldClasses} ${className}`} {...props} />
    </FieldShell>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}
export function Textarea({ label, error, hint, className = "", ...props }: TextareaProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <textarea rows={3} className={`${fieldClasses} resize-none ${className}`} {...props} />
    </FieldShell>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}
export function Select({ label, error, className = "", children, ...props }: SelectProps) {
  return (
    <FieldShell label={label} error={error}>
      <select className={`${fieldClasses} ${className}`} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}
