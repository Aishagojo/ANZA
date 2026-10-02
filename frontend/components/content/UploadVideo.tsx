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
import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import { authorizeUpload, registerVideo } from "@/lib/api";
import { CloudinaryUploadResult, VideoRecord, VideoStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type Phase = "idle" | "authorizing" | "uploading" | "registering" | "done" | "error";

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

export function UploadVideo({ onUploaded }: { onUploaded: (video: VideoRecord) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "authorizing" || phase === "uploading" || phase === "registering";

  async function handleFile(file: File) {
    setError(null);
    setProgress(0);
    setFileName(file.name);
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
      onUploaded(registered.video);
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message : "The upload could not be completed.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={16} /> Uploaded and registered
        </p>
        <p className="mt-1 break-all text-xs text-emerald-700">{fileName}</p>
        <Button variant="secondary" className="mt-3" onClick={() => { setPhase("idle"); setFileName(null); }}>
          Upload another video
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-semibold text-blue-900">Upload a new video</p>
      <p className="mt-1 text-xs text-blue-800">
        The file goes straight from your browser to Cloudinary. It is never uploaded through the
        application server.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="mt-3 block w-full text-sm text-blue-900 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {busy && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-medium text-blue-800">
            <span>
              {phase === "authorizing" && "Authorising upload…"}
              {phase === "uploading" && `Uploading${progress ? ` ${progress}%` : ""}…`}
              {phase === "registering" && "Registering your video…"}
            </span>
            {phase === "uploading" && <span>{progress}%</span>}
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
              style={{ width: phase === "uploading" ? `${progress}%` : phase === "registering" ? "100%" : "5%" }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-700">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {!busy && !error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-blue-700">
          <UploadCloud size={14} /> MP4, WebM or MOV.
        </p>
      )}
    </div>
  );
}
