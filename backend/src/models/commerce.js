// Additional Day 1 record definitions; storage and endpoint integration follow separately.
const text = { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' };
const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,100}$' };
const hex = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const time = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const positive = { ...time, minimum: 1 };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const https = { type: 'string', pattern: '^https://[^\\s]+$', maxLength: 2048 };

export function buildCommerceSchemas(core) {
  return {
    // Public listing projection; existing Terms remain compatible with signed v1 offers.
    MediaListing: object({
      ...core.Offer.properties,
      title: { ...text, maxLength: 200 }, description: text, preview_image_url: https
    }),
    // The original is private. Store an opaque storage key, never a public download URL.
    MediaAsset: object({
      id, offer_id: id, creator_pubkey: hex,
      original_object_key: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,200}$' },
      original_sha256: hex,
      mime_type: status('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav'),
      size_bytes: positive, created_at: time
    }),
    AcceptanceRecord: object({
      id, buyer_id: id, offer_id: id, ...core.Acceptance.properties, accepted_at: time
    }),
    Order: object({
      id, buyer_id: id, offer_id: id, offer_event_id: hex, acceptance_id: id,
      payment_id: nullable(id), license_id: nullable(id),
      status: status('pending', 'paid', 'expired', 'failed'), created_at: time
    }),
    // Raw download tokens are never persisted. Consume the hash atomically later.
    DownloadGrant: object({
      id, buyer_id: id, license_id: id, asset_id: id, token_hash: hex,
      created_at: time, expires_at: time, used_at: nullable(time), revoked_at: nullable(time)
    })
  };
}
