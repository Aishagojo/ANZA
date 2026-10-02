import { schemas } from '../models/schemas.js';
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, content: json(ref(schema)) });
const request = (schema) => ({ required: true, content: json(ref(schema)) });
const auth = [{ nostrAuth: [] }];
const errors = Object.fromEntries([
  ['400', 'Invalid request'], ['401', 'Authentication required'], ['403', 'Not permitted'],
  ['404', 'Resource not found'], ['409', 'State or idempotency conflict'],
  ['413', 'Request exceeds 64 KiB'], ['415', 'Use application/json'], ['503', 'Dependency unavailable']
].map(([status, description]) => [status, response(description, 'Error')]));
const pathId = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,100}$' } };
const key = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' } };
export const contract = {
  openapi: '3.1.0',
  info: { title: 'ContentPort API', version: '0.3.0', description: 'Offer, payment and license routes, plus the content layer that connects a creator-owned video to an existing offer.' },
  servers: [{ url: 'http://localhost:3000/api' }],
  components: { schemas, securitySchemes: {
    nostrAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Nostr <base64 signed NIP-98 event>. POST events must bind the raw body hash and contentport-idempotency-key tag. See docs/day-2.md.' }
  } },
  paths: {
    '/offers': {
      get: {
        operationId: 'discoverOffers', summary: 'List published offers for brand discovery',
        security: [{}], responses: { ...errors, '200': response('Discoverable offers with watermarked previews', 'Discovery') }
      },
      post: {
        operationId: 'createOffer', summary: 'Create a draft owned by the authenticated creator, optionally linked to an owned video',
        description: 'Supply either video_id or a complete content_url and content_sha256, never both. With video_id the server resolves the canonical watermarked preview and fingerprint from the video record and ignores any client media reference.',
        security: auth, parameters: [key], requestBody: request('OfferDraft'),
        responses: { ...errors, '201': response('Draft created', 'Offer') }
      }
    },
    '/offers/{id}': { parameters: [pathId], get: {
      operationId: 'getOffer', summary: 'Read a published offer; drafts require owner authentication',
      security: [{}, ...auth], responses: { ...errors, '200': response('Offer details', 'Offer') }
    } },
    '/offers/{id}/publish': { parameters: [pathId], post: {
      operationId: 'publishOffer', summary: 'Validate creator signature and queue the exact signed offer',
      security: auth, parameters: [key], requestBody: request('SignedEvent'),
      responses: { ...errors, '202': response('Publication queued; poll for relay acknowledgement', 'Offer') }
    } },
    '/offers/{id}/payments': { parameters: [pathId], post: {
      operationId: 'createPayment', summary: 'PLANNED: record buyer acceptance and request an invoice from the creator wallet',
      security: auth, parameters: [key], requestBody: request('Acceptance'),
      responses: { ...errors, '201': response('Invoice created', 'Payment') }
    } },
    '/payments/{id}': { parameters: [pathId], get: {
      operationId: 'getPayment', summary: 'PLANNED: read payment and license status as buyer or owning creator',
      security: auth, responses: { ...errors, '200': response('Settlement and publication status', 'PaymentStatus') }
    } },
    '/videos': {
      get: {
        operationId: 'listMyVideos', summary: 'List the authenticated creator’s own videos and their offer relationships',
        security: auth, responses: { ...errors, '200': response('Creator library', 'OwnedVideoLibrary') }
      },
      post: {
        operationId: 'registerVideo', summary: 'Register a Cloudinary asset uploaded directly by the browser',
        description: 'The browser uploads straight to Cloudinary using parameters signed by POST /videos/upload-authorization, then sends the resulting asset metadata here. Ownership comes from the authenticated Nostr public key, never from the request body.',
        security: auth, parameters: [key], requestBody: request('VideoRegistration'),
        responses: { ...errors, '201': response('Video registered', 'OwnedVideo') }
      }
    },
    '/videos/upload-authorization': { post: {
      operationId: 'authorizeVideoUpload', summary: 'Sign Cloudinary upload parameters for one direct browser upload',
      security: auth, parameters: [key], responses: { ...errors, '201': response('Signed upload parameters; the API secret is never returned', 'UploadAuthorization') }
    } },
    '/videos/{id}': { parameters: [pathId], get: {
      operationId: 'getVideo', summary: 'Read one video owned by the authenticated creator',
      security: auth, responses: { ...errors, '200': response('Owned video', 'OwnedVideo') }
    }, delete: {
      operationId: 'deleteVideo', summary: 'Delete a video the authenticated creator owns and that no offer references',
      security: auth, responses: { ...errors, '200': response('Deleted', 'DeletedVideo') }
    } }
  }
};
