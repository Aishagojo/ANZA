import { HTMLAttributes } from "react";

/** Bordered surface used for the offer form, offer summary, license card, etc. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft sm:p-8 ${className}`}
      {...props}
    />
  );
}
