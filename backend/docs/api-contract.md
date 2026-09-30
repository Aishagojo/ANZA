# Day 1: API contract

The machine-readable contract is [openapi.json](openapi.json), generated from [contract.js](../src/contracts/contract.js). Offer routes are implemented for Day 2; payment routes remain planned. See [Day 2 setup](day-2.md). Base path: `/api`. Requests and responses use JSON.

## Authentication and retries

Day 2 offer endpoints use signed `Authorization: Nostr <base64-event>` requests, binding creator identity to a verified public key. See [authentication details](day-2.md#authentication-for-frontend-integration). Payment authentication and buyer acceptance remain future implementation work.

Every POST requires `Idempotency-Key` (16–128 characters). Scope keys to authenticated public key, method, and path. Same key and same body return the saved result; changed body returns `409`. Persist the key before external side effects and reconcile wallet timeouts before creating another invoice. Never return another user's invoice merely because they reused a key.

| Method and path | Input | Success | Access |
| :--- | :--- | :--- | :--- |
| `POST /offers` | Terms | `201` Offer | Creator |
| `GET /offers/{id}` | Path ID | `200` Offer | Public once published; otherwise creator only |
| `POST /offers/{id}/publish` | SignedEvent | `202` Offer | Owning creator |
| `POST /offers/{id}/payments` | Acceptance | `201` Payment | Planned buyer access |
| `GET /payments/{id}` | Path ID | `200` PaymentStatus | Planned buyer/creator access |

Unauthenticated reads of unpublished offers return `404`. Payment reads must check ownership; an opaque ID alone is not authorization.

## Create an offer

```json
{
  "brand": "Example Brand Kenya",
  "content_url": "https://example.com/preview.mp4",
  "content_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "amount_sats": 25000,
  "usage_rights": "Non-exclusive organic use on the brand's Instagram account; no paid ads or sublicensing.",
  "duration": { "type": "fixed", "days": 30 }
}
```

Illustrative hash only; actual offers use the hash of the referenced bytes. Response includes `id`, `creator_pubkey`, the submitted `terms`, `status: "draft"`, `event_id: null`, and server `created_at`. The server supplies identity, IDs, timestamps, and status.

## Publish

Submit the complete creator-signed Nostr offer. The server must verify the event ID and signature, authenticated creator key, configured kind, namespace, designated attestor, and exact draft terms. Enforce an initial submission clock tolerance of five minutes; retries of already accepted events keep their original timestamp.

The response is the Offer with `status: "publishing"` and the signed `event_id`. The frontend polls `GET /offers/{id}` until `published`. A queue acceptance does not mean a relay has stored the event. Do not mutate or reserialize signed content during retries.

## Request payment

```json
{
  "offer_event_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "accepted": true,
  "licensee_name": "Example Brand Kenya"
}
```

Capture acceptance of the displayed signed terms before requesting the invoice. The response is a Payment containing invoice, amount in sats, payment hash, expiry, `status: "pending"`, and `settled_at: null`. The creator wallet must issue the invoice; ContentPort must not substitute a platform collection wallet.

Poll the status endpoint, initially every three seconds with backoff after failures. It returns `{ "payment": <Payment>, "license": null }` before settlement, then the License with its own publication status. Display payment confirmation even if the license event is still pending publication.

## Errors

```json
{ "error": { "code": "OFFER_NOT_PAYABLE", "message": "This offer is not available for payment." } }
```

| HTTP | Example code | Meaning |
| :--- | :--- | :--- |
| 400 | `VALIDATION_ERROR` | Invalid fields, signed event, or acceptance |
| 401 | `UNAUTHENTICATED` | Missing/invalid session |
| 403 | `FORBIDDEN` | Authenticated account lacks access |
| 404 | `NOT_FOUND` | Missing resource or private draft |
| 409 | `OFFER_NOT_PAYABLE`, `IDEMPOTENCY_CONFLICT` | State or retry conflict |
| 503 | `DEPENDENCY_UNAVAILABLE` | Wallet unavailable; retry with the same key |

No public endpoint can mark a payment settled. A future wallet adapter must authenticate notifications or query the wallet directly and reconcile invoice details before changing state. Frontend success screens and published Nostr claims are not settlement evidence.
