import Link from "next/link";
import { Radio, Zap } from "lucide-react";

/**
 * Global footer — shown at the bottom of EVERY page (it is added once in
 * app/layout.tsx).
 *
 * How links are handled:
 *  - Pages that already exist  -> real links (type: "link").
 *  - Pages planned but not built yet -> plain text + a "Soon" badge (type: "soon"),
 *    so nobody clicks on a page that does not exist yet.
 *  - Outside websites -> open in a new tab (type: "external").
 *
 * When a page becomes ready, change its `type` to "link" and add its `href`.
 */

type FooterItem =
  | { label: string; type: "link"; href: string }
  | { label: string; type: "external"; href: string }
  | { label: string; type: "soon" };

type FooterColumn = { title: string; items: FooterItem[] };

const columns: FooterColumn[] = [
  {
    title: "Product",
    items: [
      { label: "Home", type: "link", href: "/" },
      { label: "Create an Offer", type: "link", href: "/create" },
      { label: "How it works", type: "link", href: "/#how-it-works" },
      { label: "My Offers", type: "soon" },
      { label: "License Mgmt", type: "soon" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", type: "soon" },
      { label: "Help & FAQ", type: "soon" },
      { label: "Contact", type: "soon" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Terms", type: "soon" },
      { label: "Privacy", type: "soon" },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        label: "Docs",
        type: "external",
        href: "https://github.com/Aishagojo/Group1-H4H#readme",
      },
      { label: "Nostr", type: "external", href: "https://nostr.com" },
      { label: "Lightning", type: "external", href: "https://lightning.network" },
    ],
  },
];

function FooterListItem({ item }: { item: FooterItem }) {
  if (item.type === "link") {
    return (
      <li>
        <Link
          href={item.href}
          className="footer-link-underline text-slate-600 transition-colors hover:text-blue-600"
        >
          {item.label}
        </Link>
      </li>
    );
  }

  if (item.type === "external") {
    return (
      <li>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1 text-slate-600 transition-colors hover:text-blue-600"
        >
          <span className="footer-link-underline">{item.label}</span>
          <span
            aria-hidden
            className="text-[10px] text-slate-400 transition-colors group-hover:text-blue-600"
          >
            ↗
          </span>
        </a>
      </li>
    );
  }

  // Page not built yet: plain text with a small "Soon" badge
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-slate-400">
      <span aria-disabled="true">{item.label}</span>
      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        Soon
      </span>
    </li>
  );
}

function FooterCard({ column }: { column: FooterColumn }) {
  return (
    <div className="footer-card-hover min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-md shadow-slate-300/40 sm:p-4 md:p-5">
      <h4 className="mb-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-normal text-slate-900 sm:mb-4 sm:gap-2 sm:text-[11px] sm:tracking-[0.15em]">
        <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm shadow-blue-500/50" />
        <span>{column.title}</span>
      </h4>
      <ul className="space-y-2 break-words text-xs sm:space-y-3 sm:text-sm">
        {column.items.map((item) => (
          <FooterListItem key={item.label} item={item} />
        ))}
      </ul>
    </div>
  );
}

function SocialPlaceholder({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  // No official account yet: shown as a disabled button.
  return (
    <span
      role="img"
      aria-label={`${label} (coming soon)`}
      title={`${label} — coming soon`}
      className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400 shadow-md shadow-slate-300/50"
    >
      {children}
    </span>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-slate-300/60 bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {/* ─── TOP: brand + socials + call to action ─── */}
        <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="group mb-3 inline-flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border-t border-white/30 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/40 transition-shadow group-hover:shadow-blue-600/60">
                <Radio size={18} aria-hidden />
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-blue-700">
                ContentPort
              </span>
            </Link>

            <p className="text-sm leading-relaxed text-slate-600">
              License creator content. Prove the agreement. Pay instantly.
            </p>

            <div className="mt-5 flex gap-2.5">
              <SocialPlaceholder label="X (Twitter)">𝕏</SocialPlaceholder>
              <SocialPlaceholder label="Nostr">
                <Radio size={16} aria-hidden />
              </SocialPlaceholder>
            </div>
          </div>

          {/* Call-to-action card */}
          <div className="relative w-full overflow-hidden rounded-2xl border-t border-white/20 bg-gradient-to-br from-blue-500 via-blue-700 to-blue-900 px-8 py-7 shadow-2xl shadow-blue-900/30 lg:max-w-md">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-blue-400/30 blur-3xl" />
            <div className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-white/70 shadow-sm" />
            <div className="absolute right-7 top-6 h-1 w-1 rounded-full bg-white/40" />

            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="mb-1 text-xl font-bold leading-snug tracking-tight text-white drop-shadow-sm">
                  Ready to publish?
                </h3>
                <p className="text-xs text-blue-100/90">
                  Turn your content into a licensed offer.
                </p>
              </div>

              <Link
                href="/create"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
              >
                Create an Offer
                <span className="footer-arrow-move inline-block" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* ─── Glowing separator ─── */}
        <div className="relative mb-10 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
        </div>

        {/* ─── 4 fixed columns (never stacked, even on small screens) ─── */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-4 gap-2 pb-12 sm:gap-3 md:gap-5"
        >
          {columns.map((column) => (
            <FooterCard key={column.title} column={column} />
          ))}
        </nav>

        {/* ─── Separator ─── */}
        <div className="relative mb-6 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        </div>

        {/* ─── BOTTOM BAR ─── */}
        <div className="flex flex-col items-center justify-between gap-4 text-xs md:flex-row">
          <div className="flex flex-col items-center gap-3 text-slate-600 sm:flex-row">
            <p>© 2026 ContentPort. Built for Kenyan creators.</p>
            <span className="hidden h-3 w-px bg-slate-300 sm:inline" />
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 shadow-sm shadow-emerald-500/10">
              <span className="footer-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              All systems operational
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-600">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">
              Powered by
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm">
              <Radio size={14} className="text-blue-600" aria-hidden /> Nostr
            </span>
            <span className="text-slate-400">+</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm">
              <Zap size={14} className="text-bitcoin" aria-hidden /> Bitcoin Lightning
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
