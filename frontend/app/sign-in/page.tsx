/**
 * Screen 1 — Sign In / Choose Your Experience.
 *
 * Purpose:
 *   This page is the new entry screen for the ANZA product flow. A user,
 *   whether creator or brand, chooses their experience before entering the
 *   app. In the current frontend, this is modeled as a UI-only selection flow
 *   and uses static navigation links to the next screens.
 *
 * Functionality:
 *   - Shows the brand heading and the two user role cards.
 *   - Each card routes to a dedicated profile screen.
 *   - The real authentication step would be handled by the backend/Nostr flow.
 *
 * Backend note:
 *   - The actual Nostr identity validation and role assignment should be done
 *     by the backend once the user authenticates via Nostr/NIP-07.
 */
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Video } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

const roles = [
  {
    title: "Creator",
    description: "Upload content, create offers, and get paid.",
    href: "/creator-profile",
    icon: Video,
    accent: "border-blue-300 bg-blue-50 text-blue-700",
  },
  {
    title: "Brand / Client",
    description: "Discover content, review offers, and license media.",
    href: "/brand-profile",
    icon: BriefcaseBusiness,
    accent: "border-slate-300 bg-slate-50 text-slate-700",
  },
];

export default function SignInPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-100 px-4 py-12 text-slate-800">
        <div className="mx-auto max-w-5xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-8">
            <div>
              <p className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                License creator content.
              </p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                Prove the agreement.
              </p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                Pay instantly.
              </p>
            </div>

            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              Decentralized content licensing powered by Nostr and Bitcoin Lightning.
            </p>

            {/*
             * This visual card is kept intentionally static to match the provided layout.
             * The real content preview and verification state would be populated by the backend.
             */}
            <div className="relative mx-auto max-w-md overflow-hidden rounded-[2rem] border border-orange-200 bg-gradient-to-br from-orange-200 via-orange-100 to-blue-100 p-4 shadow-xl shadow-orange-200/40">
              <div className="rounded-[1.5rem] bg-slate-100/80 p-3 shadow-inner">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-200 via-sky-100 to-blue-200 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="h-10 w-10 rounded-full bg-white/70" />
                    <div className="h-10 w-10 rounded-full border-4 border-blue-600 bg-white/80" />
                  </div>
                  <div className="h-32 rounded-xl bg-gradient-to-br from-blue-700 via-sky-600 to-sky-500" />
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-yellow-400" />
                      <span className="text-sm font-semibold text-slate-700">5,000 sats</span>
                    </div>
                    <div className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Verified on Nostr
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-8 text-center">
              <p className="text-3xl font-black tracking-tight text-slate-900">ANZA</p>
              <p className="mt-2 text-sm font-medium text-slate-500">License. Pay. Verify.</p>
              <p className="mt-6 text-lg font-semibold text-slate-700">
                Sign in with your Nostr identity
              </p>
            </div>

            <div className="space-y-5">
              {roles.map(({ title, description, href, icon: Icon, accent }) => (
                <Link
                  key={title}
                  href={href}
                  className={`block rounded-2xl border-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${accent}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                        <Icon size={28} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{title}</h2>
                        <p className="mt-1 text-sm text-slate-600">{description}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm">
                      Continue
                      <ArrowRight size={16} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-slate-500">
              Secure • Decentralized • Your identity, your control
            </p>
          </div>
        </div>
      </div>
      </main>
    </>
  );
}
