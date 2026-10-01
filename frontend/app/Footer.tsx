import Link from "next/link";
import { ArrowUpRight, Radio, Zap } from "lucide-react";

/**
 * Global footer — shown at the bottom of EVERY page (it is added once in
 * app/layout.tsx).
 *
 * Layout: compact blue navigation block (brand + 4 link columns) followed by
 * a white legal / technical bar.
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
      {
        label: "Lightning",
        type: "external",
        href: "https://lightning.network",
      },
    ],
  },
];

function FooterListItem({ item }: { item: FooterItem }) {
  if (item.type === "link") {
    return (
      <li>
        <Link
          href={item.href}
          className="text-xs font-semibold text-white transition-colors hover:text-blue-200"
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
          className="group inline-flex items-center gap-1 text-xs font-semibold text-white transition-colors hover:text-blue-200"
        >
          {item.label}
          <ArrowUpRight
            size={10}
            aria-hidden
            className="text-blue-200 transition-colors group-hover:text-white"
          />
        </a>
      </li>
    );
  }

  // Page not built yet: plain text with a small "Soon" badge
  return (
    <li className="flex cursor-not-allowed items-center gap-1.5 text-xs font-medium text-blue-200">
      <span aria-disabled="true">{item.label}</span>
      <span className="rounded bg-blue-900/40 px-1 py-0.5 text-[9px] uppercase text-blue-100">
        Soon
      </span>
    </li>
  );
}

export function Footer() {
  return (
    <footer className="w-full">
      {/* ─── PART 1: blue navigation block ─── */}
      <div className="rounded-t-2xl bg-gradient-to-br from-brand to-brand-dark py-8 text-white shadow-md">
        <div className="mx-auto max-w-page px-6">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row">
            {/* Logo & description */}
            <div className="lg:w-1/4">
              <Link
                href="/"
                className="mb-3 inline-flex flex-col items-start gap-3"
              >
                <span className="rounded-md border border-white/10 bg-white/20 p-2 backdrop-blur-sm">
                  <img
                    src="/images/Dynamic%20ANZA%20Media%20Logo.png"
                    alt="ANZA"
                    className="h-12 w-auto object-contain sm:h-14"
                  />
                </span>
              </Link>
              <p className="max-w-[180px] text-xs leading-relaxed text-blue-100">
                License creator content. Prove the agreement. Pay instantly.
              </p>
            </div>

            {/* 4 link columns */}
            <nav
              aria-label="Footer"
              className="grid w-full grid-cols-2 gap-6 md:grid-cols-4 lg:w-3/4"
            >
              {columns.map((column) => (
                <div key={column.title}>
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-blue-200">
                    {column.title}
                  </h3>
                  <ul className="space-y-2">
                    {column.items.map((item) => (
                      <FooterListItem key={item.label} item={item} />
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* ─── PART 2: white legal / technical bar ─── */}
      <div className="border-t border-gray-200 bg-white py-3">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-3 px-6 md:flex-row">
          {/* Left: copyright + system status */}
          <div className="flex flex-col items-center gap-3 text-[11px] font-medium text-gray-600 sm:flex-row">
            <p>© 2026 ANZA. Built for Kenyan creators.</p>
            <span className="hidden text-gray-300 sm:block">|</span>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
              <span className="footer-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
              All systems operational
            </span>
          </div>

          {/* Right: powered by */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">
              Powered by
            </span>
            <span className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-700">
              <Radio size={12} className="text-blue-600" aria-hidden /> Nostr
            </span>
            <span className="text-[10px] font-bold text-gray-300">+</span>
            <span className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-700">
              <Zap size={12} className="text-bitcoin" aria-hidden /> Bitcoin
              Lightning
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
