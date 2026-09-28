import { HTMLAttributes } from "react";

/** Bordered surface used for the offer form, offer summary, license card, etc. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-white p-6 sm:p-8 ${className}`}
      {...props}
    />
  );
}
