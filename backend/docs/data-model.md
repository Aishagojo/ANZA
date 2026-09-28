# Day 1: data model

Status: proposed v1, with executable shape validation in [schemas.js](../src/models/schemas.js).

## Conventions

- Internal IDs are opaque strings; event IDs, public keys, and hashes are 64 lowercase hexadecimal characters.
- Dates are integer Unix seconds in UTC. Prices are positive integer satoshis; no floating-point money or implicit KES conversion.
- Required nullable fields use explicit `null`, not an omitted property. Unknown fields are rejected.
- License duration is either `{ "type": "fixed", "days": 30 }` or `{ "type": "perpetual" }`. A day is 86,400 seconds, starting at verified settlement.
- One offer targets one brand and produces at most one license. Multiple brands need separate offers.

## Core records

| Schema | Purpose and relationships |
| :--- | :--- |
| Creator | Internal ID, unique Nostr public key, private wallet connection reference, creation time |
| Terms | Brand name, public HTTPS content reference, SHA-256 of the referenced asset bytes, integer price, permitted uses, duration |
| Offer | Creator public key, immutable terms once publication starts, state, signed offer event ID, creation time |
| Acceptance | Exact offer event ID, affirmative acceptance, and licensee's self-declared name |
| Payment | Offer ID and event ID, amount, invoice, unique payment hash, expiry, settlement state and time |
| License | Offer and payment references, license dates, independently tracked publication state and event ID |
| Settlement | Internal adapter output consumed by the event builder after wallet verification; never trusted from a browser |

These JSON Schemas define field shapes. Database constraints and the cross-record rules below still need implementation. `SignedEvent` validates structure only, not a signature.

## Private persistence records to implement

Store acceptance with `buyer_id`, server-recorded `accepted_at`, `offer_event_id`, and the submitted licensee name. This is an acknowledgement from an account, not proof of authority to represent a brand. Link each payment to that buyer and acceptance; do not expose those private fields in the public offer.

Store wallet connection credentials encrypted outside public records; the creator record holds only a reference. Do not store creator Nostr private keys. Retain verified settlement evidence privately, including provider reference and observation time. Keep the exact signed event bytes in a publication outbox with retry count, next attempt, and relay acknowledgements.

For the database phase: unique creator public key, unique payment hash, unique license offer ID and payment ID, and unique outbox event ID. Foreign keys bind payments and licenses to offers, and acceptances to buyer accounts. Persist idempotency records under authenticated account + method + path + key, with a request digest and saved response.

## State and consistency rules

```text
Offer:       draft → publishing → published → licensed
Payment:     pending → expired
             pending or expired → settled (verified wallet evidence only)
Publication: pending → published
```

Offer `event_id` is null in draft and set when a verified signed event enters the outbox. Only mark an offer published after at least one configured relay acknowledges it. Retry the same signed event after relay failure. Published records cannot be silently edited; new terms require a new offer.

Creating a payment requires a published offer, acceptance of its exact event ID, and no existing active invoice. A transaction or lock must enforce that condition under concurrent requests. Reuse the active invoice for a retry by the same buyer; reject conflicting requests. Invoice amount and destination come from stored terms and creator configuration, never the buyer's request.

Settlement must match the stored invoice hash, amount, destination, and offer. Atomically mark payment settled, mark offer licensed, create the license, and queue its event. `settled_at` is null until settlement. Fixed license `ends_at = starts_at + days × 86400`; perpetual licenses have null `ends_at`. Publication failure leaves the payment settled and the license publication pending.

Late settlement of an expired invoice must be reconciled, not discarded. If a different invoice has already licensed the offer, record the additional settlement and raise a manual duplicate-payment resolution; never create a second license automatically. Cancellation/refund policy is a later product decision.

## Public versus private

Public: signed offer terms, creator public key, designated attestor key, and licensing attestation. A content URL must be an intentional public preview/reference, not a signed private download URL. The hash binds the referenced bytes but does not establish authorship.

Private: buyer identity, acceptance audit details, wallet credentials, invoices, provider payloads, and payment preimages. Public attestations include a payment hash, but that hash alone proves neither payment nor payer identity.

## Extended Day 1 schemas

See the [media, order, Lightning receipt and download schemas](extended-data-model.md) for the new definitions, validation rules, and remaining persistence/API work.
