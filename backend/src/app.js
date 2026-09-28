import { createServer } from 'node:http';
import { authenticate, sha256 } from './middleware/auth.js';
import { matchOfferRoute } from './routes/offers.js';
import { createOfferController } from './controllers/offers.js';
import { HttpError } from './utils/errors.js';

export function createApp({ service, verifyEvent, origin, now = () => Math.floor(Date.now() / 1000), onError = console.error }) {
  const controller = createOfferController(service);
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request URL.');
      const url = new URL(request.url, origin);
      const route = matchOfferRoute(request.method, url.pathname);
      if (!route) throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found.');
      const key = request.headers['idempotency-key'];
      if (request.method === 'POST' && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key))) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key must contain 16–128 letters, numbers, underscores, or hyphens.');
      }
      if (request.method === 'POST' && request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 64 KiB.');
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks);
      let pubkey;
      if (route.auth || request.headers.authorization) {
        pubkey = authenticate({ authorization: request.headers.authorization, method: request.method,
          url: origin + request.url, rawBody, idempotencyKey: key, verifyEvent, now: now() });
      }
      let body;
      if (request.method === 'POST') {
        try { body = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid JSON.'); }
      }
      const result = await controller[route.action]({ id: route.id, pubkey, body, key, digest: sha256(rawBody) });
      response.writeHead(result.status);
      response.end(JSON.stringify(result.body));
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known) onError(error);
      response.writeHead(known ? error.status : 503);
      response.end(JSON.stringify({ error: {
        code: known ? error.code : 'DEPENDENCY_UNAVAILABLE',
        message: known ? error.message : 'The service is temporarily unavailable.'
      } }));
    }
  });
}
