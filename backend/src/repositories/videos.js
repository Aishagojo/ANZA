import { PostgresOfferStore } from './offers.js';

// Extends the offer store rather than adding a second data-access object: the
// content layer reads and writes the same offers table and shares its
// idempotency and outbox behaviour.
export class PostgresContentStore extends PostgresOfferStore {
  async insertVideo(video) {
    await this.pool.query('INSERT INTO videos(id, owner_public_key, document) VALUES ($1, $2, $3)',
      [video.id, video.owner_public_key, video]);
    return video;
  }
  async getVideo(id) {
    return (await this.pool.query('SELECT document FROM videos WHERE id = $1', [id])).rows[0]?.document;
  }
  // Ownership is decided by the query, so a caller cannot reach another
  // creator's record by guessing an id.
  async getOwnedVideo(id, ownerPublicKey) {
    return (await this.pool.query('SELECT document FROM videos WHERE id = $1 AND owner_public_key = $2',
      [id, ownerPublicKey])).rows[0]?.document;
  }
  async listVideosByOwner(ownerPublicKey) {
    return (await this.pool.query(
      'SELECT document FROM videos WHERE owner_public_key = $1 ORDER BY created_at DESC, id DESC', [ownerPublicKey]
    )).rows.map(row => row.document);
  }
  async deleteOwnedVideo(id, ownerPublicKey) {
    return (await this.pool.query('DELETE FROM videos WHERE id = $1 AND owner_public_key = $2',
      [id, ownerPublicKey])).rowCount;
  }
  // Authoritative offer relationship per video. The licensing engine owns these
  // states; the content layer only reads them so the frontend does not have to
  // infer offer state from the presence of an id. jsonb ->> yields text, so the
  // numeric fields are normalised here rather than at each call site.
  listOffersForVideo(videoId) {
    return this.offerSummaries('WHERE video_id = $1', [videoId]);
  }
  listOffersForOwner(ownerPublicKey) {
    return this.offerSummaries('WHERE video_id IS NOT NULL AND document->>\'creator_pubkey\' = $1', [ownerPublicKey]);
  }
  async offerSummaries(where, params) {
    return (await this.pool.query(
      `SELECT video_id, document->>'id' AS id, document->>'status' AS status,
              document->'terms'->>'amount_sats' AS amount_sats, document->>'created_at' AS created_at
       FROM offers ${where} ORDER BY created_at DESC`, params
    )).rows.map(row => ({ ...row, amount_sats: Number(row.amount_sats), created_at: Number(row.created_at) }));
  }
  // Discovery. Only offers the licensing engine has already published are
  // discoverable, and an offer already licensed is no longer purchasable so it
  // is not offered for purchase again. The joined video supplies the
  // watermarked preview; the stored original is never selected here.
  async listDiscoverableOffers(limit) {
    return (await this.pool.query(
      `SELECT o.document AS offer, v.document AS video
       FROM offers o LEFT JOIN videos v ON v.id = o.video_id
       WHERE o.document->>'status' = ANY($1)
       ORDER BY (o.document->>'created_at')::bigint DESC
       LIMIT $2`, [['published', 'licensing'], limit]
    )).rows;
  }
}
