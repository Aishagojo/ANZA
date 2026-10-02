"use client";

/**
 * Brand Profile / Browse Offers.
 *
 * The feed is public, so it loads without any signer. Cards are projections of
 * the discovery listing; clicking one opens the authoritative offer detail at
 * GET /offers/{id}, which is the same endpoint the purchase flow uses. Nothing
 * here reconstructs an offer from card data and nothing is hardcoded.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, Search } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { creatorHandle, discoverOffers, formatDuration, licenseType } from "@/lib/api";
import { DiscoveryListing } from "@/lib/types";
import { LICENSE_TYPE_LABELS } from "@/lib/licenseTypes";

type Filter = "all" | "short" | "long";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "short", label: "Short form" },
  { id: "long", label: "Long form" },
];

export default function BrandProfilePage() {
  const [offers, setOffers] = useState<DiscoveryListing[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setOffers(await discoverOffers());
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Offers could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return offers.filter((offer) => {
      if (filter === "short" && (offer.duration_seconds ?? 0) > 60) return false;
      if (filter === "long" && (offer.duration_seconds ?? 0) > 0 && (offer.duration_seconds ?? 0) <= 60) return false;
      if (!needle) return true;
      return (
        (offer.title ?? "").toLowerCase().includes(needle) ||
        (offer.description ?? "").toLowerCase().includes(needle) ||
        creatorHandle(offer.creator_public_key).toLowerCase().includes(needle)
      );
    });
  }, [offers, query, filter]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-r border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
                  <BriefcaseBusiness size={24} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">@brand</p>
                  <p className="text-xs text-slate-500">Licensing feed</p>
                </div>
              </div>

              <nav className="mt-5 space-y-3">
                <span className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-left font-semibold text-blue-700">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-700">
                    <ArrowUpRight size={16} />
                  </span>
                  Browse Offers
                </span>
                {/* Needs buyer identity in the payment flow before it can list
                    anything, so it stays disabled rather than half-wired. */}
                <span
                  title="Requires buyer identity in the payment flow"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-400"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400">
                    <ArrowUpRight size={16} />
                  </span>
                  My Licenses
                  <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    Soon
                  </span>
                </span>
                <span
                  title="Reuses the Nostr identity of the connected signer"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-400"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400">
                    <ArrowUpRight size={16} />
                  </span>
                  Profile
                </span>
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
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Browse Offers
                  </h1>
                  <p className="mt-1 text-slate-500">
                    Watermarked previews from creators who have published a
                    licensing offer.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search titles and creators"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      filter === option.id
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {message && (
                <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {message}
                </p>
              )}

              {state === "loading" && (
                <p className="mt-8 text-sm text-slate-500">Loading offers…</p>
              )}

              {state === "ready" && offers.length === 0 && (
                <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <p className="font-semibold text-slate-700">No offers yet</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Offers appear here once a creator publishes one to Nostr.
                  </p>
                </div>
              )}

              {state === "ready" && offers.length > 0 && visible.length === 0 && (
                <p className="mt-8 text-sm text-slate-500">
                  No offers match that search.
                </p>
              )}

              {visible.length > 0 && (
                <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((offer) => (
                    <OfferCard key={offer.offer_id} offer={offer} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function OfferCard({ offer }: { offer: DiscoveryListing }) {
  const image = offer.thumbnail_url ?? offer.preview_url;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="relative">
        <img src={image} alt={offer.title ?? "Creator content"} className="h-44 w-full object-cover" />
        {offer.duration_seconds !== null && (
          <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white">
            {formatDuration(offer.duration_seconds)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col space-y-4 p-4">
        <div>
          <p className="truncate text-lg font-semibold text-slate-800" title={offer.title ?? undefined}>
            {offer.title ?? "Creator content"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {creatorHandle(offer.creator_public_key)}
          </p>
        </div>

        <div className="space-y-2 text-sm text-slate-600">
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-500">License</span>
            <span className="font-medium text-slate-700">
              {LICENSE_TYPE_LABELS[licenseType(offer.license_duration)]}
            </span>
          </p>
          {/* Sats are the only price. There is no KES conversion, so none is shown. */}
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-500">Price</span>
            <span className="text-lg font-bold text-slate-900">
              {offer.price_sats.toLocaleString()} <span className="text-sm font-medium text-slate-500">sats</span>
            </span>
          </p>
        </div>

        <Link
          href={`/offers/${offer.offer_id}`}
          className="mt-auto flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          View Offer
        </Link>
      </div>
    </article>
  );
}
