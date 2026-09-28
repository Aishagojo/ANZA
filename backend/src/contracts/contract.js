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
  info: { title: 'ContentPort API', version: '0.2.0', description: 'Day 2 offer routes implemented. Payment routes remain planned.' },
  servers: [{ url: 'http://localhost:3000/api' }],
  components: { schemas, securitySchemes: {
    nostrAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Nostr <base64 signed NIP-98 event>. POST events must bind the raw body hash and contentport-idempotency-key tag. See docs/day-2.md.' }
  } },
  paths: {
    '/offers': { post: {
      operationId: 'createOffer', summary: 'Create a draft owned by the authenticated creator',
      security: auth, parameters: [key], requestBody: request('Terms'),
      responses: { ...errors, '201': response('Draft created', 'Offer') }
    } },
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
    } }
  }
};
