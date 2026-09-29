import test from 'node:test';
import assert from 'node:assert/strict';
import { createLndClient } from '../src/services/payments/lnd-client.js';

test('Polar LND client creates a BOLT11 invoice for the exact offer amount', async () => {
  let request;
  const paymentHash = Buffer.from('a'.repeat(64), 'hex').toString('base64');
  const client = createLndClient({
    restUrl: 'https://127.0.0.1:8081', macaroon: 'polar-admin-macaroon',
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options };
      return new Response(JSON.stringify({ r_hash: paymentHash, payment_request: 'lnbcrt1contentport' }), { status: 200 });
    }
  });
  const invoice = await client.createInvoice({ amountSats: 5000, description: 'ContentPort license', expiry: 3600 });
  assert.equal(request.url, 'https://127.0.0.1:8081/v1/invoices');
  assert.equal(request.headers['Grpc-Metadata-macaroon'], 'polar-admin-macaroon');
  assert.deepEqual(JSON.parse(request.body), { memo: 'ContentPort license', value: 5000, expiry: 3600 });
  assert.equal(invoice.payment_hash, 'a'.repeat(64));
  assert.equal(invoice.request, 'lnbcrt1contentport');
  assert.equal(invoice.amount_sat, 5000);
});

test('Polar LND client reports a settled invoice by payment hash', async () => {
  const paymentHash = 'b'.repeat(64);
  const client = createLndClient({
    restUrl: 'https://127.0.0.1:8081', macaroon: 'polar-admin-macaroon',
    fetchImpl: async (url, options) => {
      assert.equal(String(url), `https://127.0.0.1:8081/v1/invoice/${paymentHash}`);
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ r_hash: Buffer.from(paymentHash, 'hex').toString('base64'), state: 'SETTLED', settle_date: '1234' }), { status: 200 });
    }
  });
  assert.deepEqual(await client.lookupInvoice(paymentHash), { status: 'settled', settled_at: 1234 });
});

test('Polar LND client is absent until the macaroon is configured', () => {
  assert.equal(createLndClient({ restUrl: 'https://127.0.0.1:8081' }), null);
});
