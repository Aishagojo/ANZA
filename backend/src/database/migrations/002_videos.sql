-- Content layer. A video is created before an offer exists, so the original
-- asset is recorded here and referenced by offers.video_id rather than
-- being keyed to an offer like the unused MediaAsset blueprint in
-- models/commerce.js describes.
BEGIN;
CREATE TABLE IF NOT EXISTS videos (
  id text PRIMARY KEY,
  -- Denormalised from document->>'owner_public_key' so ownership is enforced by
  -- the database query, never by the caller.
  owner_public_key text NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_owner_idx ON videos(owner_public_key, created_at DESC);
-- Mirrors document->>'video_id', matching the existing event_id column
-- convention. Lets discovery and the creator library join without scanning
-- the offers jsonb.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS video_id text REFERENCES videos(id);
CREATE INDEX IF NOT EXISTS offers_video_idx ON offers(video_id);
-- One signed upload authorisation per asset. Storing the session binds a
-- registered Cloudinary asset to the creator whose signed parameters produced
-- it, so a creator cannot register an asset that belongs to someone else.
CREATE TABLE IF NOT EXISTS upload_sessions (
  id text PRIMARY KEY,
  owner_public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
COMMIT;
