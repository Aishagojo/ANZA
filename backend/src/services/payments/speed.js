import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../utils/errors.js';

// Retained only for the already-existing webhook endpoint while settlement is migrated.
export function verifySpeedWebhook({ rawBody, headers, secret }) {
  if (!secret) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Payment webhook verification is not configured.');
  const id = String(headers['webhook-id'] || '');
  const timestamp = String(headers['webhook-timestamp'] || '');
  const received = String(headers['webhook-signature'] || '').split(' ').map(value => value.trim().replace(/^v1,/, '')).filter(Boolean);
  if (!id || !timestamp || !received.length) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Missing webhook signature.');
  let key;
  try { key = Buffer.from(String(secret).replace(/^wsec_/, ''), 'base64'); } catch { key = Buffer.alloc(0); }
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest('base64');
  const valid = received.some(signature => {
    const value = Buffer.from(signature);
    const expectedValue = Buffer.from(expected);
    return value.length === expectedValue.length && timingSafeEqual(value, expectedValue);
  });
  if (!valid) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
}
