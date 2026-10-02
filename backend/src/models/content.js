// Content layer records. A video is owned content that exists before any offer;
// the offer stays the licensing entity and references the video.
// Following the convention in commerce.js, nested records spread their parent's
// properties rather than using $ref, because validation compiles each schema
// standalone.
const text = { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' };
const hex = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const time = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const positive = { ...time, minimum: 1 };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const https = { type: 'string', pattern: '^https://[^\\s]+$', maxLength: 2048 };
// Cloudinary public ids may contain folder separators. The service additionally
// requires the configured ContentPort folder prefix, which the schema cannot
// express because the folder is deployment configuration.
const publicId = { type: 'string', pattern: '^[A-Za-z0-9_\\-/]{1,200}$' };
const recordId = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,100}$' };
const licenseDuration = { oneOf: [
  object({ type: { const: 'fixed' }, days: { ...positive, maximum: 36500 } }),
  object({ type: { const: 'perpetual' } })
] };

// The stored video. reference_sha256 is derived by the server from the
// Cloudinary asset reference and is the authoritative fingerprint used in
// signed offer terms. original_sha256 is the creator-reported fingerprint of
// the uploaded bytes: the browser uploads straight to Cloudinary, so the server
// never sees the bytes and cannot verify it.
const videoRecord = object({
  id: recordId,
  owner_public_key: hex,
  title: { ...text, maxLength: 200 },
  cloud_name: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
  public_id: publicId,
  asset_version: positive,
  resource_type: { const: 'video' },
  format: { type: 'string', pattern: '^[A-Za-z0-9]{1,8}$' },
  // Media processing state only. Offer, payment and license states are owned by
  // the licensing engine and are never mirrored onto a video.
  status: status('processing', 'ready', 'failed'),
  reference_sha256: hex,
  original_sha256: nullable(hex),
  bytes: nullable(positive),
  duration_seconds: nullable({ ...time, minimum: 0 }),
  width: nullable(positive),
  height: nullable(positive),
  // Upload authorisation session issued by this server. Proves the asset was
  // uploaded with parameters this backend signed for this creator.
  upload_session_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,100}$' },
  created_at: time,
  updated_at: time
});

const offerSummary = object({
  offer_id: recordId,
  status: status('draft', 'publishing', 'published', 'licensed'),
  price_sats: positive,
  created_at: time
});

// A creator's own video plus the authoritative offer relationship, so the
// frontend never infers offer state from whether an id happens to be present.
// original_url is owner-only: discovery never emits it.
const ownedVideo = object({
  video: videoRecord,
  preview_url: https,
  thumbnail_url: https,
  original_url: https,
  offers: { type: 'array', items: offerSummary }
});

// Brand-facing projection. Deliberately omits the original asset reference, the
// owner's private metadata and any delivery secret: only a watermarked preview
// and a server-built thumbnail are exposed.
const discoveryListing = object({
  offer_id: recordId,
  video_id: nullable(recordId),
  title: nullable({ ...text, maxLength: 200 }),
  description: nullable(text),
  creator_public_key: hex,
  preview_url: https,
  thumbnail_url: nullable(https),
  duration_seconds: nullable({ ...time, minimum: 0 }),
  license_duration: licenseDuration,
  price_sats: positive,
  status: status('published'),
  created_at: time
});

export function buildContentSchemas() {
  return {
    Video: videoRecord,
    // Request body for registering an uploaded asset.
    VideoRegistration: object({
      title: { ...text, maxLength: 200 },
      upload_session_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,100}$' },
      public_id: publicId,
      asset_version: positive,
      resource_type: { const: 'video' },
      format: { type: 'string', pattern: '^[A-Za-z0-9]{1,8}$' },
      // Mirrors the Cloudinary context field signed into the upload.
      context: { type: 'string', pattern: '^contentport_session=[A-Za-z0-9_-]{16,100}$' },
      status: status('processing', 'ready', 'failed'),
      original_sha256: nullable(hex),
      bytes: nullable(positive),
      duration_seconds: nullable({ ...time, minimum: 0 }),
      width: nullable(positive),
      height: nullable(positive)
    }),
    // Server-signed upload authorisation. The API secret never appears here.
    UploadAuthorization: object({
      cloud_name: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
      api_key: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
      resource_type: { const: 'video' },
      folder: { type: 'string', pattern: '^[A-Za-z0-9_\\-/]{1,200}$' },
      context: { type: 'string', pattern: '^contentport_session=[A-Za-z0-9_-]{16,100}$' },
      upload_session_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,100}$' },
      timestamp: positive,
      signature: { type: 'string', pattern: '^[0-9a-f]{40}$' },
      allowed_formats: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^[a-z0-9]{1,8}$' } }
    }),
    // A creator's own video plus the authoritative offer relationship, so the
    // frontend never infers offer state from whether an id happens to be present.
    OwnedVideo: ownedVideo,
    OwnedVideoLibrary: object({ videos: { type: 'array', items: ownedVideo } }),
    DiscoveryListing: discoveryListing,
    Discovery: object({ offers: { type: 'array', items: discoveryListing } }),
    DeletedVideo: object({ id: recordId, deleted: { const: true } })
  };
}
