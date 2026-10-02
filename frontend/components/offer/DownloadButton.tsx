"use client";

import { useState } from "react";
import { AlertCircle, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * DownloadButton — lets the brand that holds a license save the video file.
 * Used only on the LICENSED confirmation view of the offer page.
 *
 * How it downloads: the file is fetched in the page and handed to the
 * browser as a normal "Save as" download, so the person stays on the page.
 * If the host blocks that (cross-origin rules), it falls back to a direct
 * link; for Cloudinary links the "fl_attachment" flag forces a download
 * instead of playing the video in the tab.
 */
type Phase = "idle" | "loading" | "done" | "error";

const VIDEO_EXT = /\.(mp4|webm|mov)(?=$|[?#])/i;

function fileNameFor(title: string, url: string): string {
  const ext = url.match(VIDEO_EXT)?.[1]?.toLowerCase() ?? "mp4";
  const base =
    title
      .replace(VIDEO_EXT, "")
      .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "licensed-video";
  return `${base}.${ext}`;
}

function forcedDownloadUrl(url: string): string {
  const isCloudinary = url.includes("res.cloudinary.com") && url.includes("/upload/");
  return isCloudinary && !url.includes("fl_attachment")
    ? url.replace("/upload/", "/upload/fl_attachment/")
    : url;
}

function saveBlob(blob: Blob, name: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export function DownloadButton({ url, title }: { url: string; title: string }) {
  const [phase, setPhase] = useState<Phase>("idle");

  async function handleDownload() {
    setPhase("loading");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      saveBlob(await response.blob(), fileNameFor(title, url));
      setPhase("done");
    } catch {
      // The host refused an in-page fetch: let the browser download it directly.
      try {
        const a = document.createElement("a");
        a.href = forcedDownloadUrl(url);
        a.download = fileNameFor(title, url);
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setPhase("done");
      } catch {
        setPhase("error");
      }
    }
    setTimeout(() => setPhase((p) => (p === "loading" ? p : "idle")), 4000);
  }

  return (
    <div className="shrink-0">
      <Button
        onClick={handleDownload}
        disabled={phase === "loading"}
        aria-busy={phase === "loading"}
        className="w-full min-w-[11rem] sm:w-auto"
      >
        {phase === "loading" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {phase === "done" && <Check size={16} aria-hidden="true" />}
        {phase === "error" && <AlertCircle size={16} aria-hidden="true" />}
        {phase === "idle" && <Download size={16} aria-hidden="true" />}
        {phase === "loading" ? "Downloading…" : phase === "done" ? "Download started" : phase === "error" ? "Try again" : "Download video"}
      </Button>
      <p role="status" className="sr-only">
        {phase === "done" ? "Download started" : phase === "error" ? "The download failed" : ""}
      </p>
    </div>
  );
}
