import { randomUUID } from 'node:crypto';
import { validate } from '../../validators/validation.js';
import { HttpError } from '../../utils/errors.js';
import { originalUrl, previewUrl, thumbnailUrl, mediaRef, ALLOWED_FORMATS, RESOURCE_TYPE } from '../media/cloudinary.js';

const UPLOAD_SESSION_TTL = 3600;

const attachOffers = rows => rows.map(row => ({
  offer_id: row.id, status: row.status, price_sats: row.amount_sats, created_at: row.created_at
}));

export function createContentService({ store, cloudinary, now = () => Math.floor(Date.now() / 1000) }) {
  const input = (schema, body) => {
    try { validate(schema, body); } catch (error) { throw new HttpError(400, 'VALIDATION_ERROR', error.message); }
  };
  const requireMedia = () => {
    if (!cloudinary) throw new HttpError(501, 'MEDIA_NOT_CONFIGURED',
      "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to backend/.env.");
    return cloudinary;
  };
  // Owner-only projection. The original is included here because the caller is
  // the authenticated owner; discovery never calls this.
  const owned = (video, offers) => ({
    video,
    preview_url: previewUrl(mediaRef(video)),
    thumbnail_url: thumbnailUrl(mediaRef(video)),
    original_url: originalUrl(mediaRef(video)),
    offers
  });
  return {
    // Authorises one direct browser-to-Cloudinary upload. The API secret stays
    // in configuration; the browser receives only the signature.
    async authorizeUpload({ pubkey, key, digest }) {
      const media = requireMedia();
      const uploadSessionId = randomUUID().replaceAll('-', '');
      const timestamp = now();
      return store.idempotent(`${pubkey}:POST:/videos/upload-authorization:${key}`, digest, async tx => {
        await tx.issueUploadSession({ id: uploadSessionId, owner_public_key: pubkey, expires_at: timestamp + UPLOAD_SESSION_TTL });
        return { status: 201, body: media.createUploadAuthorization({ uploadSessionId, timestamp }) };
      });
    },
    async register({ pubkey, body, key, digest }) {
      const media = requireMedia();
      input('VideoRegistration', body);
      if (!media.ownsPublicId(body.public_id)) throw new HttpError(400, 'VALIDATION_ERROR',
        'The asset must be uploaded to the ContentPort folder issued by the upload authorisation.');
      if (!ALLOWED_FORMATS.includes(String(body.format).toLowerCase())) throw new HttpError(400, 'VALIDATION_ERROR',
        'Unsupported media format.');
      const sessionId = body.context.split('=')[1];
      const video = {
        id: randomUUID(), owner_public_key: pubkey, title: body.title,
        cloud_name: media.cloudName, public_id: body.public_id, asset_version: body.asset_version,
        resource_type: RESOURCE_TYPE, format: body.format.toLowerCase(), status: body.status,
        reference_sha256: media.referenceSha256(body.public_id, body.asset_version),
        original_sha256: body.original_sha256, bytes: body.bytes, duration_seconds: body.duration_seconds,
        width: body.width, height: body.height, upload_session_id: sessionId,
        created_at: now(), updated_at: now()
      };
      input('Video', video);
      return store.idempotent(`${pubkey}:POST:/videos:${key}`, digest, async tx => {
        if (!await tx.consumeUploadSession(sessionId, pubkey, now())) {
          throw new HttpError(403, 'FORBIDDEN', 'No valid upload authorisation matches this registration.');
        }
        await tx.insertVideo(video);
        return { status: 201, body: owned(video, []) };
      });
    },
    // Ownership is decided by the database query on the authenticated public
    // key, never by anything the caller sends.
    async listMine({ pubkey }) {
      const videos = await store.listVideosByOwner(pubkey);
      const offers = await store.listOffersForOwner(pubkey);
      const byVideo = new Map();
      for (const row of offers) {
        if (!byVideo.has(row.video_id)) byVideo.set(row.video_id, []);
        byVideo.get(row.video_id).push({ offer_id: row.id, status: row.status, price_sats: row.amount_sats, created_at: row.created_at });
      }
      return { status: 200, body: { videos: videos.map(video => owned(video, byVideo.get(video.id) || [])) } };
    },
    async getOne({ id, pubkey }) {
      const video = await store.getOwnedVideo(id, pubkey);
      if (!video) throw new HttpError(404, 'NOT_FOUND', 'Video not found.');
      return { status: 200, body: owned(video, attachOffers(await store.listOffersForVideo(id))) };
    },
    async remove({ id, pubkey }) {
      const video = await store.getOwnedVideo(id, pubkey);
      if (!video) throw new HttpError(404, 'NOT_FOUND', 'Video not found.');
      if ((await store.listOffersForVideo(id)).length) {
        throw new HttpError(409, 'VIDEO_IN_USE', 'This video is already referenced by an offer and cannot be deleted.');
      }
      await store.deleteOwnedVideo(id, pubkey);
      return { status: 200, body: { id, deleted: true } };
    }
  };
}
