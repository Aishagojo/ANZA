/**
 * Screen 3 — Brand / Client Profile / Browse Content.
 *
 * Purpose:
 *   This is the discovery view for brands and clients. The user explores a
 *   collection of creator content, compares licensing terms, and clicks into the
 *   existing public offer flow.
 *
 * Functionality:
 *   - Shows a dashboard with tabs for Browse Offers, My Licenses, and Profile.
 *   - Displays a feed of creator media cards with price, license duration, and creator tag.
 *   - Each card links to the existing public offer route so the purchase flow continues.
 *
 * Backend note:
 *   - The list of available offers and creator metadata should come from the backend
 *     listing endpoint, not from static mock JSON in production.
 */
import Link from "next/link";
import { Search, ShieldCheck, UserCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

const offers = [
  {
    id: "summer-campaign",
    title: "Mountain View Adventure",
    creator: "@creator",
    license: "30-Day Social",
    price: "5,000 sats",
    approxKes: "≈ KES 750",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-1",
  },
  {
    id: "city-time-lapse",
    title: "City Sunset Timelapse",
    creator: "@visuals",
    license: "90-Day Commercial",
    price: "8,000 sats",
    approxKes: "≈ KES 1,200",
    image:
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-2",
  },
  {
    id: "local-food",
    title: "Local Food Experience",
    creator: "@foodie",
    license: "30-Day Social",
    price: "4,000 sats",
    approxKes: "≈ KES 600",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-3",
  },
  {
    id: "life-moments",
    title: "Lifestyle Moments",
    creator: "@lifestyle",
    license: "30-Day Social",
    price: "5,500 sats",
    approxKes: "≈ KES 825",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-4",
  },
  {
    id: "ocean-footage",
    title: "Ocean Drone Footage",
    creator: "@oceanic",
    license: "90-Day Commercial",
    price: "10,000 sats",
    approxKes: "≈ KES 1,500",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-5",
  },
  {
    id: "green-landscape",
    title: "Green Valley Landscape",
    creator: "@nature",
    license: "15-Day Social",
    price: "15,000 sats",
    approxKes: "≈ KES 2,260",
    image:
      "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1200&q=80",
    href: "/offers/brand-offer-6",
  },
];

export default function BrandProfilePage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
                <UserCircle2 size={26} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">@acme-kenya</p>
                <p className="text-xs text-slate-500">npub1...9a2f</p>
              </div>
            </div>

            <nav className="mt-5 space-y-3">
              <button className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-left font-semibold text-blue-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-700">
                  <ShieldCheck size={16} />
                </span>
                Browse Offers
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-600 transition hover:bg-slate-200/60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                  <ShieldCheck size={16} />
                </span>
                My Licenses
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-600 transition hover:bg-slate-200/60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                  <ShieldCheck size={16} />
                </span>
                Profile
              </button>
            </nav>

            <div className="mt-10 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-lg text-emerald-500">⚡</span>
                Powered by
              </div>
              <p className="mt-1 text-slate-500">Nostr + Lightning</p>
            </div>
          </aside>

          <section className="p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Available Offers</h1>
                <p className="mt-1 text-slate-500">Discover and license amazing content from creators around the world.</p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <Search size={16} />
                <input
                  aria-label="Search creator or keyword"
                  placeholder="Search by creator, brand or keyword..."
                  className="w-60 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-3 text-sm font-medium text-slate-600">
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow-sm">All</button>
              <button className="rounded-xl bg-slate-100 px-4 py-2">Videos</button>
              <button className="rounded-xl bg-slate-100 px-4 py-2">Images</button>
              <button className="rounded-xl bg-slate-100 px-4 py-2">Illustrations</button>
              <button className="rounded-xl bg-slate-100 px-4 py-2">Campaigns</button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {offers.map((offer) => (
                <article key={offer.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                  <div className="relative">
                    <img src={offer.image} alt={offer.title} className="h-44 w-full object-cover" />
                    <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white">
                      00:45
                    </span>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                        {offer.creator.slice(1, 2).toUpperCase()}
                      </span>
                      {offer.creator}
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{offer.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">{offer.license}</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-base text-amber-700">
                          ₿
                        </span>
                        <span className="font-semibold">{offer.price}</span>
                      </div>
                      <span className="font-medium text-slate-500">{offer.approxKes}</span>
                    </div>

                    <Link
                      href={offer.href}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      View Offer
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
      </main>
    </>
  );
}
