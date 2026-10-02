BEGIN;

-- Licenses are created when a Lightning payment settles and are published to
-- the relay as a second Nostr event alongside the offer.
CREATE TABLE IF NOT EXISTS licenses (
  id text PRIMARY KEY,
  offer_id text NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,
  payment_id text NOT NULL UNIQUE,
  starts_at bigint NOT NULL,
  ends_at bigint,
  publication_status text NOT NULL DEFAULT 'pending' CHECK (publication_status IN ('pending', 'published')),
  event_id text UNIQUE
);

-- Offers and license events share one outbox. event_role tells the publication
-- worker which of the two it just accepted.
ALTER TABLE nostr_outbox ADD COLUMN IF NOT EXISTS event_role text NOT NULL DEFAULT 'offer';
ALTER TABLE nostr_outbox ADD COLUMN IF NOT EXISTS license_id text REFERENCES licenses(id) ON DELETE CASCADE;

-- The original table constrained offer_id to UNIQUE, which allowed only one
-- event per offer and so blocked a license event. Replace it with a per-role
-- constraint so an offer can carry its offer event and its license event.
ALTER TABLE nostr_outbox DROP CONSTRAINT IF EXISTS nostr_outbox_offer_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS nostr_outbox_offer_role_key ON nostr_outbox (offer_id, event_role);
CREATE UNIQUE INDEX IF NOT EXISTS nostr_outbox_license_key ON nostr_outbox (license_id) WHERE license_id IS NOT NULL;

COMMIT;
