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
import { CheckCircle, FileClock, Play, Plus, Video } from "lucide-react";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { formatDuration, listMyVideos, publishOffer } from "@/lib/api";
import { OfferSummary, OwnedVideo } from "@/lib/types";
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
    label: "Offer live",
    classes: "bg-blue-50 text-brand",
    icon: <CheckCircle size={12} />,
  },
  draft: {
    label: "Draft offer",
    classes: "bg-amber-50 text-amber-800",
    icon: <FileClock size={12} />,
  },
  none: { label: "No offer", classes: "bg-slate-100 text-slate-600", icon: <></> },
};

const VIDEO_STATUS: Record<string, { label: string; classes: string; dot: string }> = {
  ready: { label: "Ready", classes: "bg-success-bg text-success", dot: "bg-success" },
  processing: { label: "Processing", classes: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  failed: { label: "Processing failed", classes: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

function sizeLabel(video: OwnedVideo["video"]): string {
  const parts: string[] = [];
  if (video.bytes) parts.push(`${(video.bytes / (1024 * 1024)).toFixed(1)} MB`);
  if (video.format) parts.push(video.format.toUpperCase());
  return parts.join(" · ");
}

export default function CreatorProfilePage() {
  const [videos, setVideos] = useState<OwnedVideo[]>([]);
  const [state, setState] = useState<LibraryState>("loading");
  const [message, setMessage] = useState<string | null>(null);
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
      else setState("unauthenticated");
    });
  }, [refresh]);

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
  const canUpload = state === "ready";

  const uploadAction = canUpload ? (
    <Link
      href="/creator-profile/upload"
      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-brand-dark active:scale-[0.98]"
    >
      <Plus size={16} /> Upload Video
    </Link>
  ) : (
    <Button disabled>
      <Plus size={16} /> Upload Video
    </Button>
  );

  return (
    <AppShell role="creator" active="videos" initial={identity ? identity.slice(0, 1) : undefined}>
      <PageHeader
        eyebrow="Creator"
        title="My Videos"
        subtitle="Upload and manage the videos you want to license."
        action={uploadAction}
      />

      {message && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </p>
      )}

      {state === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your library">
          {[0, 1].map((n) => (
            <div key={n} className="flex animate-pulse items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-soft">
              <div className="h-[90px] w-40 rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-slate-200" />
                <div className="h-3 w-1/4 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state === "unauthenticated" && (
        <div className="anza-fade-up rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-semibold text-amber-900">A Nostr signer is required.</p>
          <p className="mt-1 text-sm text-amber-800">
            Your videos are private to your Nostr identity. Install and unlock Alby or Flamingo,
            then reload this page. Your key never reaches this app.
          </p>
        </div>
      )}

      {state === "ready" && videos.length === 0 && (
        <div className="anza-fade-up rounded-2xl border border-slate-200/80 bg-white px-6 py-16 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-brand">
            <Video size={26} />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-navy">No videos yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Upload your first video to start creating licensing offers.
          </p>
          <Link
            href="/creator-profile/upload"
            className="mt-6 inline-flex items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-brand-dark active:scale-[0.98]"
          >
            Upload your first video
          </Link>
        </div>
      )}

      {state === "ready" && videos.length > 0 && (
        <ul className="space-y-3">
          {videos.map((entry) => (
            <li key={entry.video.id}>
              <VideoRow
                entry={entry}
                publishing={
                  publishing !== null && publishing === cardState(entry.offers).offer?.offer_id
                }
                onPublish={() => {
                  const current = cardState(entry.offers);
                  if (current.kind === "draft") void handlePublish(current.offer.offer_id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/** One video as a horizontal row (design mockup 7): thumbnail, details, action. */
function VideoRow({
  entry,
  publishing,
  onPublish,
}: {
  entry: OwnedVideo;
  publishing: boolean;
  onPublish: () => void;
}) {
  const { video } = entry;
  const offer = cardState(entry.offers);
  const offerStyle = STATE_STYLE[offer.kind];
  const status = VIDEO_STATUS[video.status] ?? VIDEO_STATUS.processing;
  const ready = video.status === "ready";
  const details = sizeLabel(video);

  return (
    <article className="anza-fade-up flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-soft transition-shadow hover:shadow-md sm:flex-row sm:items-center">
      <div className="relative h-44 w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 sm:h-[90px] sm:w-40">
        <img src={entry.thumbnail_url} alt={video.title} className="h-full w-full object-cover" />
        <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand">
          <Play size={14} className="ml-0.5 fill-current" />
        </span>
        <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {formatDuration(video.duration_seconds)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-navy" title={video.title}>
          {video.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {details && <>{details} · </>}
          Uploaded{" "}
          {new Date(video.created_at * 1000).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.classes}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
          </span>
          {offer.kind !== "none" && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${offerStyle.classes}`}>
              {offerStyle.icon}
              {offerStyle.label}
            </span>
          )}
          {offer.kind !== "none" && (
            <span className="text-xs font-medium text-slate-500">
              {offer.offer.price_sats.toLocaleString()} sats
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {offer.kind === "available" ? (
          <Link
            href={`/offers/${offer.offer.offer_id}`}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
          >
            View offer
          </Link>
        ) : offer.kind === "draft" ? (
          <>
            <Link
              href={`/offers/${offer.offer.offer_id}`}
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
            >
              View draft
            </Link>
            <Button type="button" onClick={onPublish} disabled={publishing || !ready}>
              {publishing ? "Publishing…" : "Publish offer"}
            </Button>
          </>
        ) : ready ? (
          <Link
            href={`/create?videoId=${video.id}`}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-brand hover:text-brand"
          >
            Create Offer
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
          >
            Create Offer
          </span>
        )}
      </div>
    </article>
  );
}
