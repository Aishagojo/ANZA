"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Header of the LANDING PAGE ONLY (app/page.tsx).
 *
 * Every other screen keeps using <Navbar /> (Back link, "Verified Record"
 * pill...). The footer is global and lives in app/layout.tsx, so it is not
 * touched here.
 *
 * Contains exactly three things: the logo, "Sign in", and "Create an Offer".
 *
 * Behaviour: at the very top of the page the header is fully transparent, so
 * it melts into the page background (no line, no shadow, no visible band).
 * As soon as the page scrolls, it becomes a frosted white bar with a hairline
 * so the content sliding underneath stays readable.
 *
 * "Sign in": there is no login page in this MVP (out of scope, spec
 * section 28). Until it exists, "Sign in" is shown but does not navigate
 * (same idea as the "Soon" items in the footer). When the page is ready,
 * set SIGN_IN_HREF to its route, for example "/signin", and it becomes a
 * normal link automatically.
 */
const SIGN_IN_HREF: string | null = null;

const signInClasses =
  "rounded-lg px-1.5 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 sm:px-3 sm:text-sm max-[379px]:hidden";

// Brand refresh: the site name is now ANZA, so the marketing header uses the official logo asset from the public images folder.
function BrandLogo() {
  return (
    <img
      src="/images/Dynamic%20ANZA%20Media%20Logo.png"
      alt="ANZA"
      className="h-9 w-auto object-contain"
    />
  );
}

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-slate-200/70 shadow-sm shadow-slate-300/30"
          : "border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-page items-center justify-between gap-2 px-4 py-3.5 sm:px-6 sm:py-4">
        {/* Logo */}
        <Link
          href="/"
          aria-label="ANZA — home"
          className="group inline-flex shrink-0 items-center gap-2 rounded-lg sm:gap-2.5"
        >
          <span className="relative flex h-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:-translate-y-0.5">
            <BrandLogo />
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900 transition-colors group-hover:text-blue-700 sm:text-xl">
            ANZA
          </span>
        </Link>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          {SIGN_IN_HREF ? (
            <Link href={SIGN_IN_HREF} className={signInClasses}>
              Sign in
            </Link>
          ) : (
            <button
              type="button"
              aria-disabled="true"
              title="Sign in — coming soon"
              className={`${signInClasses} cursor-not-allowed`}
            >
              Sign in
            </button>
          )}

          <Link
            href="/create"
            className="group inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/40 active:translate-y-0 sm:px-5 sm:text-sm"
          >
            Create an Offer
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="hidden shrink-0 transition-transform duration-200 group-hover:translate-x-1 min-[400px]:block"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
