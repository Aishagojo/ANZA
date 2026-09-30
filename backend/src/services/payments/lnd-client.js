import { request as httpsRequest } from 'node:https';
import { HttpError } from '../../utils/errors.js';

function localLndFetch(url, options) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: options.method, headers: options.headers, rejectUnauthorized: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
    });
    request.on('error', reject);
    request.end(options.body);
  });
}

function providerError(response, payload) {
  const message = payload?.message || payload?.error || 'Polar LND could not create the Lightning invoice.';
  return new HttpError(response.status >= 500 ? 503 : 502, 'PAYMENT_PROVIDER_ERROR', message);
}

export function createLndClient({ restUrl, macaroon, fetchImpl = localLndFetch }) {
  if (!macaroon) return null;
  const base = new URL(restUrl || 'https://127.0.0.1:8081');
  if (base.protocol !== 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.pathname !== '/') {
    throw new Error('LND_REST_URL must be an HTTPS localhost origin from Polar.');
  }
  return {
    name: 'polar-lnd',
    async lookupInvoice(paymentHash) {
      if (!/^[0-9a-f]{64}$/i.test(String(paymentHash))) {
        throw new HttpError(500, 'PAYMENT_PROVIDER_ERROR', 'Stored Lightning payment hash is invalid.');
      }
      let response;
      try {
        response = await fetchImpl(new URL(`/v1/invoice/${paymentHash}`, base), {
          method: 'GET', headers: { 'Grpc-Metadata-macaroon': macaroon }
        });
      } catch {
        throw new HttpError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Polar LND is unavailable. Start your Polar network and creator node.');
      }
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      const returnedHash = payload?.r_hash ? Buffer.from(payload.r_hash, 'base64').toString('hex') : null;
      if (!response.ok || returnedHash !== String(paymentHash).toLowerCase()) throw providerError(response, payload);
      const settled = payload.settled === true || String(payload.state || '').toUpperCase() === 'SETTLED';
      const settledAt = Number(payload.settle_date);
      return { status: settled ? 'settled' : 'pending', settled_at: settledAt > 0 ? settledAt : null };
    },
    async createInvoice({ amountSats, description, expiry = 3600 }) {
      let response;
      try {
        response = await fetchImpl(new URL('/v1/invoices', base), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Grpc-Metadata-macaroon': macaroon },
          body: JSON.stringify({ memo: description, value: amountSats, expiry })
        });
      } catch {
        throw new HttpError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Polar LND is unavailable. Start your Polar network and creator node.');
      }
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      const hash = payload?.r_hash ? Buffer.from(payload.r_hash, 'base64') : null;
      if (!response.ok || !hash || hash.length !== 32 || !/^ln/i.test(String(payload.payment_request || ''))) throw providerError(response, payload);
      return {
        id: hash.toString('hex'), payment_hash: hash.toString('hex'), request: payload.payment_request,
        amount_sat: amountSats, status: 'pending', expires_at: Math.floor(Date.now() / 1000) + expiry
      };
    }
  };
}
