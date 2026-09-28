# Day 2: offer API and Nostr publication

## Implemented flow

1. Creator signs HTTP authorization with their Nostr signer.
2. `POST /api/v1/offers` validates Terms and stores a draft in PostgreSQL. Creator identity comes from the verified authorization key.
3. Creator builds and signs the offer using the configured kind and attestor key, matching the saved terms and `contentport-offer-v1` tag.
4. `POST /api/v1/offers/{id}/publish` verifies the signature, event ID, ownership, terms, and timestamp. A database transaction queues the exact event and changes the offer to `publishing`.
5. The worker sends the event to configured relays. After one matching positive acknowledgement, it marks the offer `published`. Failure leaves it queued with exponential retry delay, capped at five minutes.
6. `GET /api/v1/offers/{id}` returns the offer. Draft/publishing offers require owner authentication; published offers are public.

POST retries use a persistent idempotency record. Reusing a key with different raw JSON returns `409`; replaying the same request returns its original response. Poll GET for current status. Different publish keys cannot attach a second event to the same offer. The database and outbox survive server restarts.

## Local setup

The dependency installation requested during implementation was declined. The new `pg` and `nostr-tools` dependencies are declared but have not been installed here; the lockfile still reflects Day 1. Run `npm install` to install them and update the lockfile before committing it or using `npm ci`.

```bash
cd backend
npm install
cp .env.example .env
```

Start the local PostgreSQL database with `docker compose up -d --wait postgres` from the repository root; see the [local database guide](local-database.md). The example `DATABASE_URL` already matches that service. Configure `NOSTR_OFFER_KIND`, `NOSTR_ATTESTOR_PUBKEY`, and `NOSTR_RELAYS` in `.env`. The attestor is a public key only; the server does not require a creator private key or an attestor private key for Day 2. Use a development relay and sample terms while testing. No production ContentPort event kind is assigned.

```bash
npm run migrate
npm start
```

The server uses Node's HTTP and WebSocket implementations, PostgreSQL through `pg`, and `nostr-tools/pure` for event verification. It binds to localhost by default. Place the frontend behind the same origin or a development proxy; cross-origin browser access is not configured. Set `PUBLIC_ORIGIN` to the externally visible API origin so signed request URLs match exactly.

## Authentication for frontend integration

Day 2 replaces the provisional bearer-session design with signed Nostr HTTP authorization. For every protected request, build an event with kind `27235`, current Unix time, empty content, and these tags:

```text
["u", "http://localhost:3000/api/v1/offers"]
["method", "POST"]
["payload", "<SHA-256 of the exact UTF-8 request body bytes>"]
["contentport-idempotency-key", "<same value as Idempotency-Key header>"]
```

Sign with the creator's signer and send `Authorization: Nostr <base64 of the signed event JSON>`. POST also requires `Content-Type: application/json` and a 16–128 character `Idempotency-Key` containing letters, numbers, underscores, or hyphens. The custom idempotency tag binds that header to the signature so intercepted authorization cannot create extra drafts by changing the key. This tag is a ContentPort extension, not a NIP-98 standard field.

GET authorization needs only `u` and `method`. Authorization events must be within 60 seconds of server time. Sign a fresh authorization event for later retries while retaining the same body and idempotency key. No private key is sent to the API.

Offer event templates can be built using `buildOfferEvent` from `src/services/nostr/events.js`. Sign the returned template client-side and send the full event as the publish request body. Its initial submission must be within five minutes of server time. Retried queued events retain their original timestamp and signature.

## Current validation and limits

Unit tests cover creation, private reads, idempotency, signature-verifier rejection, ownership, offer immutability, request binding, and positive/negative/timeout relay acknowledgements using test doubles. A real cryptography test runs when `nostr-tools` is installed. PostgreSQL integration tests require an explicitly provided disposable `TEST_DATABASE_URL`.

Installation, PostgreSQL integration, and publication to a real relay have not been verified in this environment. No public offer has been published during development. Payment routes are still specifications and return `404` until implemented. Signing UI, wallet integration, production rate limiting, and deployment configuration remain future work.

Protocol references: [NIP-01 event and relay protocol](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-98 HTTP authorization](https://github.com/nostr-protocol/nips/blob/master/98.md), and [nostr-tools](https://github.com/nbd-wtf/nostr-tools).
