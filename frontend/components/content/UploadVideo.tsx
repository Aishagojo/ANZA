"use client";

/**
 * UploadVideo — direct browser-to-Cloudinary upload.
 *
 * The video binary never passes through the application backend. The browser
 * asks the backend to sign the Cloudinary parameters, uploads the file straight
 * to Cloudinary, then sends only the resulting asset metadata back to be
 * registered. The API secret stays on the server; the browser only ever sees the
 * signature.
 *
 * XMLHttpRequest is used rather than fetch because fetch cannot report upload
 * progress, and a large video gives the creator no feedback otherwise.
 */
import { DragEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileVideo,
  Play,
  UploadCloud,
  ArrowUp,
} from "lucide-react";
import { authorizeUpload, formatDuration, registerVideo } from "@/lib/api";
import { CloudinaryUploadResult, VideoRecord, VideoStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";

/**
 * Screens of the flow (design mockups 2 to 6):
 *   idle      file selection / drop zone
 *   preview   selected video, Change / Remove, Cancel / Upload Video
 *   uploading authorizing -> uploading -> registering (progress bar)
 *   done      "Video uploaded successfully"
 *   error     "Upload failed" with Try again
 */
type Phase = "idle" | "preview" | "authorizing" | "uploading" | "registering" | "done" | "error";

const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPTED_EXT = /\.(mp4|mov|webm|mkv)$/i;

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatLabel(file: File): string {
  const ext = file.name.split(".").pop();
  return (ext ?? "video").toUpperCase();
}

function uploadToCloudinary(
  params: {
    cloud_name: string;
    api_key: string;
    folder: string;
    context: string;
    timestamp: number;
    signature: string;
    resource_type: string;
  },
  file: File,
  onProgress: (percent: number) => void
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", params.api_key);
    form.append("timestamp", String(params.timestamp));
    form.append("signature", params.signature);
    form.append("folder", params.folder);
    form.append("context", params.context);
    // resource_type is deliberately not a form field. It travels in the URL path
    // and Cloudinary excludes it from the signed parameter string, so sending it
    // here would be redundant at best.

    const request = new XMLHttpRequest();
    request.open("POST", `https://api.cloudinary.com/v1_1/${params.cloud_name}/${params.resource_type}/upload`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The upload to Cloudinary failed. Check your connection and try again."));
    request.onload = () => {
      let payload: CloudinaryUploadResult & { error?: { message?: string } };
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new Error("Cloudinary returned an unreadable response."));
        return;
      }
      if (request.status < 200 || request.status >= 300 || payload.error) {
        reject(new Error(payload.error?.message ?? "Cloudinary rejected the upload."));
        return;
      }
      resolve(payload);
    };
    request.send(form);
  });
}

export function UploadVideo({
  onUploaded,
  onCancel,
  onFinish,
}: {
  /** called once the backend has registered the video */
  onUploaded?: (video: VideoRecord) => void;
  /** Cancel on the preview screen / Back on the empty screen */
  onCancel?: () => void;
  /** "Back to My Videos" on the success screen */
  onFinish?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const busy = phase === "authorizing" || phase === "uploading" || phase === "registering";

  // Free the temporary blob URL when the file changes or the screen closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.type.startsWith("video/") && !ACCEPTED_EXT.test(candidate.name)) {
      setPickError("Please choose a video file (MP4, MOV, WebM or MKV).");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setPickError("This video is larger than 500 MB. Please choose a smaller file.");
      return;
    }
    setPickError(null);
    setError(null);
    setDuration(null);
    setPlaying(false);
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
    setPhase("preview");
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setDuration(null);
    setPlaying(false);
    setProgress(0);
    setError(null);
    setPickError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  // The upload itself is unchanged: authorise -> direct Cloudinary upload ->
  // register. Only the moment it starts moved: from "file chosen" to the
  // "Upload Video" button on the preview screen.
  async function startUpload() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      setPhase("authorizing");
      const auth = await authorizeUpload();

      setPhase("uploading");
      const result = await uploadToCloudinary(auth, file, setProgress);

      setPhase("registering");
      // Cloudinary reports duration as a float and may still be transcoding, so
      // round to the integer the backend stores and report the real state
      // instead of assuming the asset is immediately offerable.
      const mediaState: VideoStatus =
        result.resource_status === "failed" ? "failed"
        : result.resource_status === "pending" ? "processing"
        : "ready";
      // The context is echoed from the signed authorisation rather than read back
      // from Cloudinary, so registration always carries the session the backend
      // issued. The backend consumes it once.
      const registered = await registerVideo({
        title: file.name.trim().slice(0, 200) || "Untitled video",
        upload_session_id: auth.upload_session_id,
        public_id: result.public_id,
        asset_version: result.version,
        resource_type: "video",
        format: result.format,
        context: auth.context,
        status: mediaState,
        // The browser has the bytes and could hash them, but the server never
        // sees the file, so it records this as an unverified claim or nothing.
        original_sha256: null,
        bytes: result.bytes ?? null,
        duration_seconds: result.duration ? Math.round(result.duration) : null,
        width: result.width ?? null,
        height: result.height ?? null,
      });

      setPhase("done");
      onUploaded?.(registered.video);
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message : "The upload could not be completed.");
    }
  }

  const shell = "anza-fade-up rounded-2xl border border-slate-200/80 bg-white shadow-soft";

  /* ───────── 2. Selection ───────── */
  if (phase === "idle") {
    return (
      <div className={`${shell} p-4 sm:p-6`}>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-brand bg-blue-50" : "border-blue-300/70 bg-blue-50/30"
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-brand">
            <UploadCloud size={28} />
          </span>
          <p className="mt-4 text-sm font-semibold text-navy">Drag and drop your video here,</p>
          <p className="text-sm text-slate-500">or choose a file from your device.</p>

          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <Button type="button" className="mt-5 px-6" onClick={() => inputRef.current?.click()}>
            Choose Video
          </Button>
          <p className="mt-4 text-xs text-slate-400">MP4, MOV, WebM or MKV · up to 500 MB</p>

          {pickError && (
            <p role="alert" className="mt-4 flex items-center gap-2 text-sm font-medium text-red-600">
              <AlertCircle size={16} /> {pickError}
            </p>
          )}
        </div>

        <ul className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs font-medium text-slate-600">
          {["MP4, MOV, WebM or MKV", "Maximum file size: 500 MB", "No editing required"].map((tip) => (
            <li key={tip} className="inline-flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success text-white">
                <Check size={10} strokeWidth={3} />
              </span>
              {tip}
            </li>
          ))}
        </ul>
        {onCancel && (
          <div className="mt-6 flex justify-end">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ───────── 3. Preview of the selected video ───────── */
  if (phase === "preview" && file && previewUrl) {
    return (
      <div className={`${shell} p-4 sm:p-6`}>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={videoRef}
            src={previewUrl}
            preload="metadata"
            controls={playing}
            className="h-full w-full object-contain"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          {!playing && (
            <>
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play preview"
                className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-brand shadow-lg transition-transform hover:scale-105"
              >
                <Play size={26} className="ml-1 fill-current" />
              </button>
              {duration !== null && (
                <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white">
                  {formatDuration(duration)}
                </span>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand">
            <FileVideo size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-slate-500">
              {formatSize(file.size)} · {formatLabel(file)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md px-2 py-1 text-sm font-semibold text-brand hover:bg-blue-50"
          >
            Change
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => pick(event.target.files?.[0])}
          />
        </div>

        {pickError && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {pickError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel ?? reset}>
            Cancel
          </Button>
          <Button type="button" onClick={startUpload}>
            Upload Video <span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    );
  }

  /* ───────── 4. Upload in progress ───────── */
  if (busy && file) {
    const percent = phase === "uploading" ? progress : phase === "registering" ? 100 : 3;
    const label =
      phase === "authorizing"
        ? "Authorising upload…"
        : phase === "uploading"
          ? "Uploading…"
          : "Registering your video…";
    return (
      <div className={`${shell} px-6 py-10 sm:px-10`}>
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-brand">
            <ArrowUp size={26} />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-navy">Uploading your video</h2>
          <p className="mt-1 text-sm text-slate-500">
            Please keep this page open while your video uploads.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-xl" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-semibold text-navy">{file.name}</span>
            <span className="ml-3 font-bold text-brand">{percent}%</span>
          </div>
          <div
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-blue-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">{label}</p>
        </div>
      </div>
    );
  }

  /* ───────── 5. Success ───────── */
  if (phase === "done") {
    return (
      <div className={`${shell} px-6 py-14 text-center`}>
        <span className="anza-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-bg ring-8 ring-green-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white">
            <Check size={22} strokeWidth={3} />
          </span>
        </span>
        <h2 className="mt-6 text-xl font-extrabold text-navy">Video uploaded successfully</h2>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{file?.name ?? "Your video"}</span> is now
          available in My Videos.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Upload complete
        </span>
        <div className="mt-6">
          <Button type="button" onClick={onFinish}>
            Back to My Videos
          </Button>
        </div>
      </div>
    );
  }

  /* ───────── 6. Error ───────── */
  return (
    <div className={`${shell} px-6 py-14 text-center`}>
      <span className="anza-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertCircle size={30} />
      </span>
      <h2 className="mt-5 text-xl font-extrabold text-navy">Upload failed</h2>
      <p className="mt-1 text-sm text-slate-500">
        Something went wrong while uploading your video. Please try again.
      </p>
      {error && (
        <p role="alert" className="mx-auto mt-3 max-w-md break-words text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" type="button" onClick={reset}>
          Choose another video
        </Button>
        <Button type="button" onClick={startUpload} disabled={!file}>
          Try again
        </Button>
      </div>
    </div>
  );
}
