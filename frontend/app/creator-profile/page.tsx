"use client";

/**
 * Creator Profile / My Content.
 *
 * The library is the authenticated creator's own videos, filtered by the
 * backend on the Nostr public key from the signed request. The browser never
 * sends a creator key, so it can only ever display what it was sent.
 *
 * Offer state comes from the offer rows the backend attaches to each video. It
 * is deliberately not inferred from whether an id happens to be present, which
 * is what stops a creator from being encouraged to create a duplicate offer
 * for a video that is already on the marketplace.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle, FileClock, ShieldCheck, UserCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { UploadVideo } from "@/components/content/UploadVideo";
import { formatDuration, listMyVideos, publishOffer } from "@/lib/api";
import { OfferSummary, OwnedVideo, VideoRecord } from "@/lib/types";
import { probeSigner, SignerProbe } from "@/lib/nostr";

type LibraryState = "loading" | "unauthenticated" | "ready" | "error";

/**
 * "Available" means the video has an offer that is live on the marketplace, so
 * creating another one is not appropriate. A video with no offers at all can be
 * offered. A video whose only offer is still a draft is not "Available" yet, and
 * the creator can pick up where they left off.
 */
type CardState =
  | { kind: "available"; offer: OfferSummary }
  | { kind: "draft"; offer: OfferSummary }
  | { kind: "none"; offer: null };

function cardState(offers: OfferSummary[]): CardState {
  const live = offers.find((offer) => offer.status === "published" || offer.status === "licensing");
  if (live) return { kind: "available", offer: live };
  const pending = offers.find((offer) => offer.status === "draft" || offer.status === "publishing");
  if (pending) return { kind: "draft", offer: pending };
  return { kind: "none", offer: null };
}

const STATE_STYLE: Record<CardState["kind"], { label: string; classes: string; icon: JSX.Element }> = {
  available: {
    label: "Available",
    classes: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle size={12} className="mr-1 inline" />,
  },
  draft: {
    label: "Draft",
    classes: "bg-amber-100 text-amber-800",
    icon: <FileClock size={12} className="mr-1 inline" />,
  },
  none: { label: "No Offer", classes: "bg-slate-100 text-slate-600", icon: <></> },
};

export default function CreatorProfilePage() {
  const [videos, setVideos] = useState<OwnedVideo[]>([]);
  const [state, setState] = useState<LibraryState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [signer, setSigner] = useState<SignerProbe | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const mine = await listMyVideos();
      setVideos(mine);
      setState("ready");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      setState(raw.includes("authorization") || raw.includes("Nostr") ? "unauthenticated" : "error");
      setMessage(raw || "Your library could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void probeSigner().then((result) => {
      setSigner(result);
      if (result.status === "connected") void refresh();
    });
  }, [refresh]);

  async function handleUploaded(_video: VideoRecord) {
    setShowUpload(false);
    await refresh();
  }

  /** Publishes a draft offer the creator has already submitted, reusing the
   * terms the server stored rather than asking for them again. */
  async function handlePublish(offerId: string) {
    setPublishing(offerId);
    setMessage(null);
    try {
      await publishOffer(offerId);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That offer could not be published.");
    } finally {
      setPublishing(null);
    }
  }

  const identity = signer?.status === "connected" ? signer.pubkey : null;

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
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700">
                    {identity ? "@creator" : "Not connected"}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500">
                    {identity ? `${identity.slice(0, 8)}…${identity.slice(-6)}` : "Nostr key required"}
                  </p>
                </div>
              </div>

              <nav className="mt-5 space-y-3">
                {/* My Videos is this screen. */}
                <span className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-left font-semibold text-blue-700">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-700">
                    <ArrowUpRight size={16} />
                  </span>
                  My Videos
                </span>
                <Link
                  href="/brand-profile"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-600 transition hover:bg-slate-200/60"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                    <ArrowUpRight size={16} />
                  </span>
                  Browse Offers
                </Link>
                <span
                  title="Requires buyer identity in the payment flow"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-400"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400">
                    <ArrowUpRight size={16} />
                  </span>
                  My Purchases
                  <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    Soon
                  </span>
                </span>
                <span
                  title="Reuses the Nostr identity shown above"
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
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Videos</h1>
                  <p className="mt-1 text-slate-500">
                    Manage your uploaded content and create licensing offers.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={state !== "ready"}
                  onClick={() => setShowUpload((open) => !open)}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showUpload ? "Close upload" : "+ Upload Video"}
                </button>
              </div>

              {showUpload && <UploadVideo onUploaded={handleUploaded} />}

              {message && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {message}
                </p>
              )}

              {state === "loading" && (
                <p className="mt-8 text-sm text-slate-500">Loading your library…</p>
              )}

              {state === "unauthenticated" && (
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <p className="font-medium text-amber-800">A Nostr signer is required.</p>
                  <p className="mt-1 text-sm text-amber-700">
                    Your videos are private to your Nostr identity. Install and unlock Alby or
                    Flamingo, then reload this page. Your key never reaches this app.
                  </p>
                </div>
              )}

              {state === "ready" && videos.length === 0 && (
                <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <p className="font-semibold text-slate-700">No videos yet</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload a video to create your first licensing offer.
                  </p>
                </div>
              )}

              {state === "ready" && videos.length > 0 && (
                <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {videos.map((entry) => (
                    <VideoCard
                      key={entry.video.id}
                      entry={entry}
                      publishing={
                        publishing !== null && publishing === cardState(entry.offers).offer?.offer_id
                      }
                      onPublish={() => {
                        const state = cardState(entry.offers);
                        if (state.kind === "draft") void handlePublish(state.offer.offer_id);
                      }}
                    />
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

function VideoCard({
  entry,
  publishing,
  onPublish,
}: {
  entry: OwnedVideo;
  publishing: boolean;
  onPublish: () => void;
}) {
  const { video } = entry;
  const state = cardState(entry.offers);
  const style = STATE_STYLE[state.kind];
  const ready = video.status === "ready";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="relative">
        <img
          src={entry.thumbnail_url}
          alt={video.title}
          className="h-44 w-full object-cover"
        />
        <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white">
          {formatDuration(video.duration_seconds)}
        </span>
        {video.status !== "ready" && (
          <span className="absolute left-3 top-3 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white">
            {video.status === "processing" ? "Processing" : "Processing failed"}
          </span>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="truncate text-lg font-semibold text-slate-800" title={video.title}>
            {video.title}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Uploaded {new Date(video.created_at * 1000).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style.classes}`}>
            {style.icon}
            {style.label}
          </span>
          {state.kind !== "none" && (
            <span className="text-xs font-medium text-slate-500">
              {state.offer.price_sats.toLocaleString()} sats
            </span>
          )}
        </div>

        {state.kind === "available" ? (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-600">
            Live on the marketplace. Brands can license this now.
          </p>
        ) : state.kind === "draft" ? (
          <div className="space-y-2">
            <Link
              href={`/offers/${state.offer.offer_id}`}
              className="flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              View draft
            </Link>
            <button
              type="button"
              onClick={onPublish}
              disabled={publishing || !ready}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish offer"}
            </button>
          </div>
        ) : (
          <Link
            href={`/create?videoId=${video.id}`}
            aria-disabled={!ready}
            className={`flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
              ready ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-400"
            }`}
          >
            Create Offer
          </Link>
        )}
      </div>
    </article>
  );
}
