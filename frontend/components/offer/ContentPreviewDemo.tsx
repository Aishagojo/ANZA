"use client";

import { useMemo, useState } from "react";

export function ContentPreviewDemo({
  url,
  title,
  size = "large",
}: {
  url: string;
  title: string;
  size?: "large" | "small";
}) {
  const [muted, setMuted] = useState(true);

  const youtubeId = useMemo(() => {
    try {
      const u = new URL(url);
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    } catch {
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    }
  }, [url]);

  const isVideoFile = /\.(mp4|webm|mov)$/i.test(url);
  const dimensions = size === "large" ? "aspect-video" : "aspect-square h-16 w-16 shrink-0";

  const embedSrc = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`
    : null;

  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ${dimensions}`}>
      {youtubeId ? (
        <iframe
          src={embedSrc ?? undefined}
          title={title}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : isVideoFile ? (
        <video src={url} className="h-full w-full object-cover" controls={size === "large"} autoPlay={size === "large"} muted={size === "large"} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="h-full w-full object-cover" />
      )}

      {youtubeId && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-3">
          <button
            onClick={() => setMuted((m) => !m)}
            className="pointer-events-auto rounded-md bg-white/90 px-3 py-1 text-sm font-medium shadow"
            aria-label={muted ? "Unmute video" : "Mute video"}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      )}
    </div>
  );
}
