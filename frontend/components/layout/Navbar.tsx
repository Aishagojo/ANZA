/*
  Navbar component — renders the global top navigation used across
  the app. Includes links to landing, create, offers and demo pages,
  and optional back/verified indicators.
*/
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NavButton } from "@/components/ui/NavButton";

/**
 * Simple global nav (spec section 7). Deliberately does NOT include
 * login/signup/dashboard/search — those are explicitly out of scope for
 * this MVP (spec section 28).
 *
 * `backHref`: pass this on internal screens to show a subtle "← Back" link
 * instead of the "How it works" anchor (which only exists on the landing page).
 * `verified`: shows the small green "Verified Record" pill (public offer page).
 */
export function Navbar({
  backHref,
  verified,
}: {
  backHref?: string;
  verified?: boolean;
}) {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-page items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-text-primary"
        >
          <img
            src="/images/Dynamic%20ANZA%20Media%20Logo.png"
            alt="ANZA"
            className="h-8 w-auto object-contain"
          />
          <span>ANZA</span>
        </Link>

        <div className="flex items-center gap-4">
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={16} /> Back
            </Link>
          )}

          {verified && (
            <span className="hidden items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-medium text-success sm:flex">
              <ShieldCheck size={14} /> Verified Record
            </span>
          )}

          {!backHref && (
            <>
              <nav className="hidden items-center gap-2 text-sm sm:flex">
                <NavButton kind="home" />
                <NavButton kind="sign-in" />
              </nav>

              <Link href="/sign-in">
                <Button className="!px-4 !py-2 text-sm">Continue</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
