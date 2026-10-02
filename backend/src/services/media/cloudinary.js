// Cloudinary integration. Direct browser-to-Cloudinary upload is authorised by
// server-signed parameters; the API secret is only ever read from configuration
// and is used to sign, never returned. Media reference URLs are built here so
// transformation strings are not scattered through frontend components.
import { createHash } from 'node:crypto';
import { HttpError } from '../../utils/errors.js';

export const RESOURCE_TYPE = 'video';
export const ALLOWED_FORMATS = ['mp4', 'webm', 'mov'];

// The public preview a brand may watch before purchase. A text layer is the
// watermark; it needs no pre-configured named overlay in the Cloudinary account.
// The unrestricted original is never built here for discovery use.
const PREVIEW = ['w_640', 'h_360', 'c_fill', 'q_auto',
  'l_text:Arial_36_bold:ANZA%20PREVIEW', 'co_white', 'o_40', 'fl_layer_apply'];
const THUMBNAIL = ['so_0', 'w_480', 'h_270', 'c_fill', 'q_auto', 'f_jpg'];

// Media reference fields shared by a stored video and the URL builders below.
export const mediaRef = video => ({ cloudName: video.cloud_name, publicId: video.public_id, format: video.format });

export function deliveryUrl({ cloudName, publicId, transformation = [], format = 'mp4' }) {
  if (!cloudName || !publicId) throw new HttpError(500, 'MEDIA_UNAVAILABLE', 'The media record is missing its Cloudinary reference.');
  const path = transformation.length ? transformation.join(',') + '/' : '';
  return `https://res.cloudinary.com/${cloudName}/${RESOURCE_TYPE}/upload/${path}${publicId}.${format}`;
}

export const previewUrl = (media, format) =>
  deliveryUrl({ ...media, transformation: PREVIEW, format: format || media.format || 'mp4' });

export const thumbnailUrl = (media, format) =>
  deliveryUrl({ ...media, transformation: THUMBNAIL, format: format || media.format || 'mp4' });

// Owner-only reference. Discovery never calls this.
export const originalUrl = media => deliveryUrl(media);

// Cloudinary signs the sorted, non-empty parameter string with the API secret.
// The upload API excludes file, cloud_name, resource_type and api_key from that
// string: resource_type travels in the URL path (/video/upload) rather than as a
// request parameter, so signing it produces a string Cloudinary never
// reconstructs and the upload is rejected as an invalid signature.
function signaturePayload(params) {
  const unsigned = { file: 1, cloud_name: 1, resource_type: 1, api_key: 1, signature: 1 };
  return Object.keys(params).sort()
    .filter(key => !unsigned[key] && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${key}=${params[key]}`)
    .join('&');
}

export function createCloudinary({ cloudName, apiKey, apiSecret, folder }) {
  if (!cloudName || !apiKey || !apiSecret) return null;
  const root = `${folder.replace(/\/+$/, '')}/`;
  return {
    name: 'cloudinary',
    cloudName,
    folder,
    // Authorises one direct upload for one creator. The session id is carried in
    // a signed Cloudinary context field and must be echoed back at registration,
    // so an asset can only be registered by the creator whose signed
    // authorisation produced it.
    // Extra parameters (tags, eager transformations, a fixed public_id) are
    // signed, because Cloudinary signs every request parameter it receives.
    // signaturePayload strips the media-management keys, so a caller cannot
    // reintroduce the mismatch.
    createUploadAuthorization({ uploadSessionId, timestamp, ...signed }) {
      const params = { ...signed, context: `contentport_session=${uploadSessionId}`, folder, timestamp };
      return {
        cloud_name: cloudName, api_key: apiKey, resource_type: RESOURCE_TYPE, folder,
        context: params.context, upload_session_id: uploadSessionId, timestamp,
        signature: createHash('sha1').update(signaturePayload(params) + apiSecret).digest('hex'),
        allowed_formats: ALLOWED_FORMATS
      };
    },
    // A creator may only register assets that landed under this deployment's
    // own folder, so a crafted public_id cannot point at another tenant's media.
    ownsPublicId(publicId) {
      return typeof publicId === 'string' && publicId.startsWith(root) && publicId.length > root.length;
    },
    // Identifies this exact immutable asset version. The server derives the
    // fingerprint from it, so a creator cannot choose the value that later gets
    // signed into offer terms.
    referenceSha256(publicId, assetVersion) {
      return createHash('sha256')
        .update(`contentport.asset.v1\u0000${cloudName}\u0000${RESOURCE_TYPE}\u0000${publicId}\u0000${assetVersion}`)
        .digest('hex');
    }
  };
}
