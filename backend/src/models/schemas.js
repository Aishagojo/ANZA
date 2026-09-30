import { buildCommerceSchemas } from './commerce.js';
// Shared JSON Schemas for runtime validation and the API contract.
const text = { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' };
const hex = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const positive = { ...integer, minimum: 1 };
const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,100}$' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const enumeration = (...values) => ({ type: 'string', enum: values });
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const schemas = {};
schemas.Terms = {
  type: 'object',
  properties: {
    title: { ...text, maxLength: 200 },
    description: text,
    brand: { ...text, maxLength: 200 },
    content_url: { type: 'string', pattern: '^https://[^\\s]+$', maxLength: 2048 },
    content_sha256: hex,
    amount_sats: positive,
    usage_rights: text,
    duration: { oneOf: [
      object({ type: { const: 'fixed' }, days: { ...positive, maximum: 36500 } }),
      object({ type: { const: 'perpetual' } })
    ] }
  },
  required: ['brand', 'content_url', 'content_sha256', 'amount_sats', 'usage_rights', 'duration'],
  additionalProperties: false
};
schemas.Creator = object({ id, nostr_pubkey: hex, wallet_connection_ref: id, created_at: integer });
schemas.Offer = object({
  id, creator_pubkey: hex, terms: schemas.Terms,
  status: enumeration('draft', 'publishing', 'published', 'licensed'),
  event_id: nullable(hex), created_at: integer
});
schemas.Acceptance = object({ offer_event_id: hex, accepted: { const: true }, licensee_name: { ...text, maxLength: 200 } });
schemas.Payment = object({
  id, offer_id: id, offer_event_id: hex, amount_sats: positive,
  payment_hash: hex, invoice: text, expires_at: integer,
  status: enumeration('pending', 'expired', 'settled'), settled_at: nullable(integer)
});
schemas.License = object({
  id, offer_id: id, offer_event_id: hex, payment_id: id,
  starts_at: integer, ends_at: nullable(integer),
  publication_status: enumeration('pending', 'published'), event_id: nullable(hex)
});
schemas.SignedEvent = object({
  id: hex, pubkey: hex, created_at: integer,
  kind: { type: 'integer', minimum: 0, maximum: 65535 },
  tags: { type: 'array', items: { type: 'array', minItems: 1, items: { type: 'string' } } },
  content: { type: 'string' }, sig: { type: 'string', pattern: '^[0-9a-f]{128}$' }
});
schemas.PaymentStatus = object({ payment: schemas.Payment, license: nullable(schemas.License) });
schemas.Error = object({ error: object({ code: text, message: text }) });
schemas.Settlement = object({ offer_event_id: hex, payment_hash: hex, amount_sats: positive, settled_at: integer });
Object.assign(schemas, buildCommerceSchemas(schemas));
export const scalarSchemas = { hex, integer };
