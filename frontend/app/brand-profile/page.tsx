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
import { Play, Search, SearchX } from "lucide-react";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
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
    <AppShell role="brand" active="browse">
      <PageHeader
        eyebrow="Brand / Client"
        title="Browse Offers"
        subtitle="Watermarked previews from creators who have published a licensing offer."
        action={
          <div className="relative w-full sm:w-72">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and creators"
              aria-label="Search offers"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-navy outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by length">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              filter === option.id
                ? "bg-brand text-white shadow-sm shadow-blue-600/20"
                : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-navy"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {message && (
        <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </p>
      )}

      {state === "loading" && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading offers">
          {[0, 1, 2].map((n) => (
            <div key={n} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft">
              <div className="h-44 bg-slate-200" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-10 rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state === "ready" && offers.length === 0 && (
        <div className="anza-fade-up rounded-2xl border border-slate-200/80 bg-white px-6 py-16 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-brand">
            <SearchX size={26} />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-navy">No offers yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Offers appear here once a creator publishes one to Nostr.
          </p>
        </div>
      )}

      {state === "ready" && offers.length > 0 && visible.length === 0 && (
        <p className="rounded-2xl border border-slate-200/80 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-soft">
          No offers match that search.
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((offer) => (
            <OfferCard key={offer.offer_id} offer={offer} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function OfferCard({ offer }: { offer: DiscoveryListing }) {
  const image = offer.thumbnail_url ?? offer.preview_url;
  return (
    <article className="anza-fade-up flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative bg-slate-900">
        <img src={image} alt={offer.title ?? "Creator content"} className="h-44 w-full object-cover" />
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand">
          <Play size={16} className="ml-0.5 fill-current" />
        </span>
        {offer.duration_seconds !== null && (
          <span className="absolute bottom-2.5 right-2.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {formatDuration(offer.duration_seconds)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col space-y-4 p-4">
        <div>
          <p className="truncate text-base font-bold text-navy" title={offer.title ?? undefined}>
            {offer.title ?? "Creator content"}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {creatorHandle(offer.creator_public_key)}
          </p>
        </div>

        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-500">License</span>
            <span className="font-semibold text-slate-700">
              {LICENSE_TYPE_LABELS[licenseType(offer.license_duration)]}
            </span>
          </p>
          {/* Sats are the only price. There is no KES conversion, so none is shown. */}
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-500">Price</span>
            <span className="text-lg font-extrabold text-navy">
              {offer.price_sats.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-slate-500">sats</span>
            </span>
          </p>
        </div>

        <Link
          href={`/offers/${offer.offer_id}`}
          className="mt-auto flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-brand-dark active:scale-[0.98]"
        >
          View Offer
        </Link>
      </div>
    </article>
  );
}
