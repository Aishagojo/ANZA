import { createServer } from 'node:http';
import { authenticate, sha256 } from './middleware/auth.js';
import { matchOfferRoute, matchWebhookRoute } from './routes/offers.js';
import { createOfferController } from './controllers/offers.js';
import { HttpError } from './utils/errors.js';

export function createApp({ service, verifyEvent, origin, corsOrigin = null, now = () => Math.floor(Date.now() / 1000), onError = console.error }) {
  const controller = createOfferController(service);
  const isAllowedOrigin = value => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
      return false;
    }
  };
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (request, response) => {
    const requestOrigin = request.headers.origin;
    if (requestOrigin && isAllowedOrigin(requestOrigin)) {
      response.setHeader('Access-Control-Allow-Origin', requestOrigin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
      response.setHeader('Access-Control-Max-Age', '600');
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request URL.');
      const url = new URL(request.url, origin);
      const route = matchWebhookRoute(request.method, url.pathname) || matchOfferRoute(request.method, url.pathname);
      if (!route) throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found.');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 64 KiB.');
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks);
      let body;
      if (request.method === 'POST' && rawBody.length) {
        try { body = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid JSON.'); }
      }
      if (route.action === 'lightningWebhook') {
        const result = await controller.lightningWebhook({ body, headers: request.headers, rawBody, digest: sha256(rawBody) });
        response.writeHead(result.status);
        response.end(JSON.stringify(result.body));
        return;
      }
      const key = request.headers['idempotency-key'];
      const needsAuth = Boolean(route.auth || request.headers.authorization);
      if (request.method === 'POST' && needsAuth && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key))) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key must contain 16–128 letters, numbers, underscores, or hyphens.');
      }
      if (request.method === 'POST' && rawBody.length && request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
      }
      let pubkey;
      if (needsAuth) pubkey = authenticate({ authorization: request.headers.authorization, method: request.method,
        url: origin + request.url, rawBody, idempotencyKey: key, verifyEvent, now: now() });
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
