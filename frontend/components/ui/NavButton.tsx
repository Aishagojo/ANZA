import Link from "next/link";
import { Home, LogIn } from "lucide-react";

/**
 * NavButton — the "Home" and "Sign in" buttons used in the top bars.
 *
 *   <NavButton kind="home" />      quiet pill with a house icon
 *   <NavButton kind="sign-in" />   outlined pill with a login icon, turns
 *                                  solid blue on hover
 *
 * One component so both buttons look identical on every screen that shows
 * them (landing header, sign-in page header). Presentation only.
 */
const KINDS = {
  home: {
    href: "/",
    label: "Home",
    Icon: Home,
    classes:
      "text-slate-600 hover:bg-slate-100 hover:text-navy",
  },
  "sign-in": {
    href: "/sign-in",
    label: "Sign in",
    Icon: LogIn,
    classes:
      "border border-slate-300 bg-white text-navy shadow-sm hover:border-brand hover:bg-brand hover:text-white hover:shadow-md hover:shadow-blue-600/20",
  },
} as const;

const base =
  "group inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 active:scale-[0.97] sm:px-4 sm:text-sm";

export function NavButton({
  kind,
  href,
  disabled = false,
  className = "",
}: {
  kind: keyof typeof KINDS;
  /** overrides the default route */
  href?: string;
  /** renders an inert "coming soon" look instead of a link */
  disabled?: boolean;
  className?: string;
}) {
  const { href: defaultHref, label, Icon, classes } = KINDS[kind];
  const content = (
    <>
      <Icon size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {label}
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title={`${label} — coming soon`}
        className={`${base} cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400 ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? defaultHref} className={`${base} ${classes} ${className}`}>
      {content}
    </Link>
  );
}
