BEGIN;
CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  event_id text UNIQUE
);
CREATE TABLE IF NOT EXISTS api_requests (
  scope text PRIMARY KEY,
  digest text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nostr_outbox (
  event_id text PRIMARY KEY,
  offer_id text NOT NULL UNIQUE REFERENCES offers(id),
  event jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  acknowledged_relay text,
  last_error text
);
CREATE TABLE IF NOT EXISTS lightning_webhooks (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text,
  payment_hash text,
  offer_id text,
  payload jsonb NOT NULL,
  headers jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
