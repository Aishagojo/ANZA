/**
 * AppShell — shared frame for every screen that comes after the Creator /
 * Brand choice (My Videos, Upload Video, Create Offer, Browse Offers, offer
 * page, payment page).
 *
 *   <AppShell role="creator" active="videos">
 *     <PageHeader eyebrow="Creator" title="My Videos" ... />
 *     ...
 *   </AppShell>
 *
 * It draws the white top bar (logo, underlined tabs, avatar) and the soft
 * blue background used in the design mockups. It is presentation only: no
 * data fetching and no backend calls.
 */
import Link from "next/link";
import { ChevronRight, ShieldCheck, User } from "lucide-react";

export type AppRole = "creator" | "brand";

type Tab = { id: string; label: string; href?: string };

/** Tabs without an href are pages that are planned but not built yet. */
const TABS: Record<AppRole, Tab[]> = {
  creator: [
    { id: "videos", label: "My Videos", href: "/creator-profile" },
    { id: "offers", label: "My Offers" },
    { id: "licenses", label: "License Mgmt" },
  ],
  brand: [
    { id: "browse", label: "Browse Offers", href: "/brand-profile" },
    { id: "licenses", label: "My Licenses" },
  ],
};

export function AppShell({
  role,
  active,
  verified,
  initial,
  children,
  width = "max-w-5xl",
}: {
  role: AppRole;
  /** id of the tab to underline */
  active?: string;
  /** shows the green "Verified Record" pill (public offer page) */
  verified?: boolean;
  /** one letter shown in the avatar; a user icon is used when omitted */
  initial?: string;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="anza-bg min-h-[calc(100vh-4rem)] pb-16">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="ANZA home">
            <img
              src="/images/Dynamic%20ANZA%20Media%20Logo.png"
              alt=""
              className="h-8 w-auto object-contain"
            />
            <span className="text-lg font-extrabold tracking-tight text-navy">ANZA</span>
          </Link>

          <nav aria-label="Main" className="flex h-full items-stretch gap-1 sm:gap-3">
            {TABS[role].map((tab) => {
              const isActive = tab.id === active;
              const base =
                "relative inline-flex items-center px-2 text-[13px] font-semibold sm:px-3 sm:text-sm";
              if (!tab.href) {
                return (
                  <span
                    key={tab.id}
                    title="Coming soon"
                    aria-disabled="true"
                    className={`${base} cursor-not-allowed text-slate-400`}
                  >
                    {tab.label}
                  </span>
                );
              }
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${base} transition-colors ${
                    isActive ? "text-brand" : "text-slate-500 hover:text-navy"
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand sm:inset-x-2" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {verified && (
              <span className="hidden items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-semibold text-success sm:flex">
                <ShieldCheck size={14} /> Verified Record
              </span>
            )}
            <span
              aria-label="Account"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
            >
              {initial ? initial.slice(0, 1).toUpperCase() : <User size={16} />}
            </span>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full ${width} px-4 pt-8 sm:px-6`}>{children}</main>
    </div>
  );
}

export type Crumb = { label: string; href?: string };

/** Breadcrumb, small blue eyebrow, bold navy title, subtitle and optional action. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  crumbs,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  action?: React.ReactNode;
}) {
  return (
    <div className="anza-fade-up mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs font-medium text-slate-500">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 && <ChevronRight size={12} className="text-slate-400" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-brand">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-slate-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>
          )}
          <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy sm:text-[2rem]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
