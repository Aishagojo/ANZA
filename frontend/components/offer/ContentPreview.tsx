/**
 * Renders the creator's content (spec section 22 — Content Hosting: just an
 * image/video URL, no upload infrastructure). We guess image vs. video from
 * the file extension — good enough for the MVP's Cloudinary-hosted samples.
 *
 * BACKEND TEAM: if you start returning a `contentType` field on the Offer
 * instead of relying on the extension, swap the `isVideo` check below for
 * `offer.contentType === "video"`.
 */
/**
 * Renders the creator's content (spec section 22 — Content Hosting: just an
 * image/video URL, no upload infrastructure). We guess image vs. video from
 * the file extension — good enough for the MVP's Cloudinary-hosted samples.
 *
 * BACKEND TEAM: if you start returning a `contentType` field on the Offer
 * instead of relying on the extension, swap the `isVideo` check below for
 * `offer.contentType === "video"`.
 */
export function ContentPreview({
  url,
  title,
  size = "large",
}: {
  url: string;
  title: string;
  size?: "large" | "small";
}) {
  const isVideo = /\.(mp4|webm|mov)$/i.test(url);
  const dimensions =
    size === "large" ? "aspect-video" : "aspect-square h-16 w-16 shrink-0";

  return (
    <div className={`overflow-hidden rounded-lg bg-surface ${dimensions}`}>
      {isVideo ? (
        <video
          src={url}
          className="h-full w-full object-cover"
          controls={size === "large"}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- content URLs are
        // arbitrary/external (Cloudinary), so next/image's domain allowlist
        // would need updating per-offer; plain <img> keeps this MVP simple.
        <img src={url} alt={title} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
