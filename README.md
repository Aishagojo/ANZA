<div align="center">

# ANZA

### Creator-signed licensing offers, verifiable on Nostr and payable over Lightning.

[![Status](https://img.shields.io/badge/status-hackathon%20MVP-F59E0B?style=flat-square)](#project-status)
[![Node](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=node.js&logoColor=white)](#tech-stack)
[![Postgres](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](#tech-stack)
[![Tests](https://img.shields.io/badge/backend%20tests-52%20passing-16A34A?style=flat-square)](#testing)

</div>

---

## Table of contents

- [What ANZA is](#what-ANZA-is)
- [Project status](#project-status)
- [Features](#features)
  - [Implemented](#implemented)
  - [Creator content and discovery](#creator-content-and-discovery--implemented)
  - [Not implemented](#not-implemented)
  - [Future architecture](#future-architecture)
- [Nostr implementation](#nostr-implementation)
- [Lightning implementation](#lightning-implementation)
- [Licensing Engine](#licensing-engine)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Environments: local, staging, production](#environments-local-staging-production)
- [Environment configuration matrix](#environment-configuration-matrix)
- [Promotion and deployment flow](#promotion-and-deployment-flow)
- [Payment safety](#payment-safety)
- [Nostr environment isolation](#nostr-environment-isolation)
- [Deployment considerations](#deployment-considerations)
- [Contributing](#contributing)
- [License](#license)
- [Team](#team)
- [Known gaps](#known-gaps)

---

## What ANZA is

ANZA turns a creator's licensing terms into a **signed, portable record** that a brand can verify without trusting the platform's UI.

The problem it addresses is mundane and specific: creators in creator-economy markets routinely agree to brand usage over DMs. Price, rights, duration, and payment expectation end up scattered across private messages, and once a deal falls apart there is no durable evidence of what was actually offered.

ANZA replaces that conversation with two machine-verifiable artefacts:

- a **creator-signed Nostr event** stating exactly what was offered — content reference, fingerprint, brand, price, permitted uses, duration;
- an **attestor-signed Nostr event** recording that a matching Lightning invoice settled.

These two events are the product. Everything else in the repository exists to produce them honestly.

Two protocols, two distinct jobs, and the separation matters:

| Protocol | Responsibility | Explicitly *not* its job |
| --- | --- | --- |
| **Nostr** | Identity (a public key is the creator), tamper-evident offer and licensing records, third-party verifiability | Moving money. Nostr has no payment network. |
| **Lightning** | Value transfer between brand and creator | Identity or authorization. A paid invoice proves a transfer, not who is legally entitled to the content. |

A Nostr signature proves *a key signed an event*. It does not prove a real-world identity, brand authority, or legal enforceability. The repository documents this limit explicitly in [`backend/docs/nostr-events.md`](backend/docs/nostr-events.md) and it is repeated in the security notes below.

---

## Project status

This is a hackathon MVP. The **Licensing Engine is implemented and verified end-to-end against a local relay**, and the two product flows that sit *around* it — creator content upload and brand discovery — are now built as well. What remains unimplemented is narrower: buyer identity, protected original-file delivery, and anything production-facing.

| Area | State |
| --- | --- |
| Licensing Engine (create → publish → pay → settle → license) | **Implemented** |
| Nostr offer publication with durable outbox | **Implemented** |
| Attestor-signed license event after settlement | **Implemented** |
| Lightning invoice + settlement via LND REST | **Implemented (dev/regtest only)** |
| PostgreSQL persistence, idempotency, outbox retry | **Implemented** |
| Creator video upload, direct to Cloudinary | **Implemented** |
| Creator content library with per-video offer state | **Implemented** |
| Video-backed offers (`video_id`) with server-resolved media reference | **Implemented** |
| Brand discovery feed over published offers | **Implemented** |
| Watermarked previews and thumbnails | **Implemented** (Cloudinary transformations) |
| Backend-derived content fingerprint (`reference_sha256`) | **Implemented** |
| Buyer identity and acceptance | **Not implemented** — buyers are anonymous |
| Protected original-file delivery | **Not implemented** |
| Production Lightning provider | **Not implemented** |
| Staging environment | **Does not exist** |
| Frontend tests, CI, ESLint config | **Do not exist** |
| Open-source license | **AGPL-3.0** decided; `LICENSE` file not yet added |

---

## Features

### Implemented

The Licensing Engine is the implemented core. Its end-to-end flow:

| # | Step | Implementation |
| --- | --- | --- |
| 1 | Creator creates a license offer | `POST /api/offers` — `frontend/app/create/page.tsx`, `frontend/components/offer/OfferForm.tsx` |
| 2 | Offer carries content + licence information | `Terms` JSON Schema, `backend/src/models/schemas.js:13-30` |
| 3 | Offer is signed by the creator's own Nostr key | NIP-07 browser signer, `frontend/lib/nostr.ts:125-148` |
| 4 | Offer is represented as a Nostr event | `buildOfferEvent`, `backend/src/services/nostr/events.js:12-18` |
| 5 | Offer becomes discoverable and viewable | `GET /api/offers/:offerId` → public offer page, `frontend/app/offers/[offerId]/page.tsx` |
| 6 | Brand selects the offer and initiates payment | `POST /api/offers/:offerId/payment` — unauthenticated, link-based |
| 7 | A Lightning invoice is created for the exact offer amount | `POST /v1/invoices` against LND, `backend/src/services/payments/lnd-client.js:49-68` |
| 8 | Payment confirmation is detected by polling LND | `GET /v1/invoice/{hash}`, `backend/src/services/offers/service.js:162-196` |
| 9 | The system records and publishes the resulting licence state | `buildLicenseEvent` → `finalizeEvent` → outbox → relay, `service.js:20-51` |
| 10 | The licensed state is verifiable | `licenses` table, `licenses.publication_status = 'published'`, offer flips to `licensed`, licence event on the relay |

Also implemented, and load-bearing for the above:

- **Signed HTTP authentication.** Every authenticated request carries `Authorization: Nostr <base64-event>`, a kind `27235` event binding the caller's pubkey to method, full URL, SHA-256 of the raw body, and the idempotency key. Verified in `backend/src/middleware/auth.js`. Creator private keys never reach the server.
- **Idempotency.** `POST` requires an `Idempotency-Key`; the response is persisted under a PostgreSQL advisory lock and replayed for a repeat, while a changed body returns `409`.
- **Durable outbox.** Signed event bytes are stored once and retried with exponential backoff. An offer is not marked `published` until a relay returns a positive `OK` for that exact event ID.
- **Single-issue guarantees.** A settled offer checks for an existing licence before building or signing, so repeated status polling cannot queue duplicate licence events.
- **Honest payment states.** `licenseIssuance` distinguishes `pending` (signing now) from `unavailable` (this deployment has no signer and never will), so a buyer is never told a licence is on its way when none will be produced.
- **Three-state signer detection.** The frontend distinguishes a missing extension from a locked one, with a 2.5 s probe timeout, rather than hanging or misreporting.

### Creator content and discovery — implemented

The content layer sits alongside the Licensing Engine and exists as a working flow. A video
is content a creator owns; it exists before any offer, and the offer references it by id
rather than by a typed-in URL.

| # | Step | Implementation |
| --- | --- | --- |
| 1 | Creator authenticates with their Nostr identity | Kind `27235` signed request — the same authentication the Licensing Engine uses |
| 2 | Backend authorises one direct Cloudinary upload | `POST /api/videos/upload-authorization` — `backend/src/services/media/cloudinary.js` |
| 3 | Creator uploads video from their device | Browser → Cloudinary directly; the application server never proxies the bytes — `frontend/components/content/UploadVideo.tsx` |
| 4 | Uploaded content is associated with that creator identity | `POST /api/videos` — the single-use upload session is consumed in the same transaction as the insert |
| 5 | Creator has a private content library | `GET /api/videos` — owner-only, each video carrying its real offer state — `frontend/app/creator-profile/page.tsx` |
| 6 | Creator selects an uploaded video and creates an offer for it | `POST /api/offers` with `video_id` — `frontend/components/offer/OfferForm.tsx` |
| 7 | The licensing flow receives the selected content reference | Resolved server-side from the video record, so the browser is never the authority for the media reference |
| 8 | Video storage, processing, watermarking | Cloudinary storage and transformations; watermarked preview and thumbnail |
| 9 | Feed browsing | `frontend/app/brand-profile/page.tsx`, built from published offers |
| 10 | Creator identity visible alongside content | Nostr handle rendered on every card |
| 11 | Watermarked previews | Cloudinary transformation; discovery never calls the unrestricted-original URL builder |
| 12 | Brand initiates purchase from a discovered item | Discovery links to the offer page, and payment is reached from there |

**Ownership.** The creator's Nostr pubkey *is* the identity. A creator cannot register an
asset using another creator's upload session, and cannot read, update or delete another
creator's video by changing the id.

**Two fingerprints, and they are not interchangeable.** `reference_sha256` is derived by
the server from the Cloudinary asset reference and version, is authoritative, and is what
goes into `terms.content_sha256` and the signed offer event. `original_sha256` is
creator-reported and cannot be verified, because the browser uploads straight to Cloudinary
and the server never sees the bytes.

**Offer state.** Each video shows one of `No Offer`, `Draft`, or `Available`, where
`Available` means an active published/licensing offer exists. `My Licenses` and
`My Purchases` are present but disabled.

### Not implemented

Genuine gaps, tracked in [Known gaps](#known-gaps):

- **Buyer identity and acceptance.** `POST /payment` and `GET /status` are unauthenticated, so anyone holding an offer link can request an invoice. There is no rate limiting.
- **Protected original-file delivery.** Watermarked previews exist and a creator can view their own original, but there is no signed, expiring download grant for a licensed buyer.
- **Production Lightning provider.** Development/regtest only.
- **Frontend tests, CI, and an ESLint configuration.** None exist.
- **Staging environment.** Does not exist.

### Future architecture

ANZA is a **single Node.js service with a PostgreSQL database**, not a microservice system. The current code deliberately separates concerns at the module level — `services/content`, `services/media`, `services/offers`, `services/nostr`, `services/payments`, `repositories`, `contracts` — and every external dependency is injected through a constructor argument (`store`, `verifyEvent`, `paymentProvider`, `signEvent`, `publish`).

That injection is the seam intended for later extraction. `createLndClient` already takes a `fetchImpl`; the relay publisher takes a `WebSocketImpl`; the offer service takes a `store`; the content service takes its own store and media client. Each of these can be replaced by a network call to a separate service without touching the business rules.

The intended direction is three independently deployable units, in dependency order:

```text
Content Layer      (uploads, storage, transcoding, watermarking)   — built, single service
        ↓
Licensing Engine   (offers, terms, payments, licences)             — built, single service
        ↓
Nostr + Lightning  (relay publication, LND)                        — built, external
```

The Licensing Engine does not need to store media, and it should not. Uploaded media does **not** belong on Nostr merely because Nostr carries the licensing record — a Nostr event is a few hundred bytes of JSON, while a video is not, and a public event is permanently public. The engine needs only a content *reference* and a fingerprint of it.

---

## Nostr implementation

### NIPs actually used

| NIP | Status | Where |
| --- | --- | --- |
| **NIP-01** — basic protocol, event envelope, `e`/`p` tags | Followed | All event construction |
| **NIP-07** — browser extension signing | Used | `frontend/lib/nostr.ts`; creator signs the offer event |
| **NIP-78** — replaceable application data | **Explicitly rejected** | See below |
| **NIP-98** — HTTP Auth (kind 27235) | Shape followed, **not claimed** | `backend/src/middleware/auth.js` |

**This project defines no custom NIPs.** A custom event kind is not a custom NIP. What exists here are *project-level event conventions* — a shared JSON envelope, a schema string, and a tag namespace — documented in [`backend/docs/nostr-events.md`](backend/docs/nostr-events.md). They are not a proposal to the Nostr protocol and should not be described as one.

Two deliberate design decisions are worth stating:

- **NIP-78 is rejected.** Replaceable events (kind `30078`) let a later write silently replace an earlier one. A licensing record is a historical fact, so the project uses regular non-replaceable events instead.
- **Kind `27235` for HTTP auth is NIP-98-shaped but not NIP-98-compliant.** The tags `u`, `method`, and `payload` follow NIP-98's intent, but the project adds a `ANZA-idempotency-key` tag that is not in the NIP, and no NIP-98 conformance is claimed anywhere in the repository. Treat it as a project-specific auth scheme that borrows the kind number.

### Event kinds

Both kinds must be chosen explicitly by the operator. There is **no default**, because a default would collide with whatever else is using that range. The builders reject anything outside `1000–9999` (`backend/src/services/nostr/events.js:4-11`).

| Kind | Variable | Dev value | Purpose | Author |
| --- | --- | --- | --- | --- |
| `9998` | `NOSTR_OFFER_KIND` | `9998` | Licence offer | Creator (their NIP-07 key) |
| `9999` | `NOSTR_LICENSE_KIND` | `9999` | Settlement attestation / licence record | Platform attestor |
| `27235` | hard-coded | `27235` | HTTP request authentication | Calling party |

`9998` and `9999` are **development placeholders**, not registered ANZA kinds. Production values must be chosen after a kind-registry collision check.

### Event structure

**Offer event** — author: creator

Tags: `[["t", "ANZA-offer-v1"]]`

Content (JSON string):

```json
{
  "schema": "ANZA.offer.v1",
  "terms": {
    "title": "Summer Campaign Video",
    "description": "Short promotional video.",
    "brand": "Acme Kenya",
    "content_url": "https://res.cloudinary.com/example/video.mp4",
    "content_sha256": "<64 hex chars>",
    "amount_sats": 25000,
    "usage_rights": "Non-exclusive organic social use.",
    "duration": { "type": "fixed", "days": 30 }
  },
  "attestor_pubkey": "<64 hex chars>"
}
```

`duration` is either `{ "type": "fixed", "days": N }` or `{ "type": "perpetual" }`.

**Licence event** — author: platform attestor

Tags: `[["e", "<offer event id>"], ["p", "<creator pubkey>"], ["t", "ANZA-license-v1"]]`

Content (JSON string):

```json
{
  "schema": "ANZA.license.v1",
  "offer_event_id": "<64 hex chars>",
  "payment_hash": "<64 hex chars>",
  "amount_sats": 25000,
  "starts_at": 1790768211,
  "ends_at": 1793360211,
  "evidence_type": "ANZA-settlement-attestation"
}
```

`starts_at` is the verified settlement time. For a fixed duration, `ends_at = starts_at + days × 86400`; for a perpetual licence, `ends_at` is `null`.

The builder re-checks the offer reference, amount, attestor, and settlement ordering before the offer is ever made (`events.js:21-33`). A settlement that disagrees with the published offer is refused rather than attested.

### Identity

Creator identity is a 32-byte x-only public key, 64 lowercase hex characters, rendered in the UI as a truncated `xxxxxxxx…yyyyyy` handle. Private keys stay inside the NIP-07 extension and are never transmitted. The platform attestor is a separate key, designated inside each offer event, which is what allows a licence to be published automatically while the creator is offline.

`NOSTR_ATTESTOR_PUBKEY` accepts either a raw 64-char hex key or an `npub`. When `NOSTR_ATTESTOR_SECRET` is also set, the backend derives the public key from it and **refuses to start** if it does not match — so a licence can never be signed by a different identity than the offers reference.

### Relays

Relays are configured as a comma-separated list in `NOSTR_RELAYS` and are validated at startup: `wss://` anywhere, `ws://` only on `localhost`/`127.0.0.1`/`[::1]`.

Local development uses [strfry](https://github.com/struktru/strfry) via `compose.yaml` at `ws://localhost:7777` (`strfry.conf`). It accepts every event and performs no authentication — it is a development convenience only.

Publication is first-acknowledgement-wins: the publisher races all configured relays (`Promise.any`) and only succeeds on a positive `OK` for the exact event ID. One relay accepting is sufficient. Relay queries are not used at runtime; the backend reads its own database.

### What is deliberately kept off Nostr

Nostr events are public and effectively permanent. The following never enters one:

buyer identity, buyer acceptance details, invoices and payment preimages, wallet credentials, private storage object keys, and download tokens.

A `payment_hash` is public, but a hash alone proves neither payment nor who paid.

---

## Lightning implementation

### Current state: development infrastructure only

**Polar is a development and test harness. It is not production infrastructure and is not part of the deployed system.** Polar runs a private Bitcoin **regtest** network; its invoices are `lnbcrt...` and exist only inside that network.

| Component | Status |
| --- | --- |
| Polar + LND "Creator" node | Development/test only — not installed in this repository, runs on the operator's machine |
| LND "Buyer" node | Development/test only — required to pay a regtest invoice |
| Direct LND REST communication | **Implemented** |
| Bitnob or any other payment provider | **Not present in the codebase** |
| Production Lightning node | **Not implemented** |

Polar has no Docker image — it is a desktop application that uses Docker to spawn node containers. It is not a `compose.yaml` service.

### How the application talks to Lightning

The backend speaks the **LND REST API directly over HTTPS**, authenticating with an admin macaroon in the `Grpc-Metadata-macaroon` header (`backend/src/services/payments/lnd-client.js`). There is no intermediary service.

- **Invoice creation** — `POST /v1/invoices` with `{ memo, value, expiry }`, where `value` is the offer's exact `amount_sats` in sats. The amount and destination come from stored terms, never from the buyer's request.
- **Settlement detection** — `GET /v1/invoice/{payment_hash}`, polled from `GET /api/offers/:offerId/status`. The response must echo a matching `r_hash` before it is trusted.
- **Expiry** — invoices are created with a 3600-second expiry. An expired unpaid invoice is replaced on the next payment request; an unexpired one is reused.

The URL is validated at startup to be an HTTPS **localhost** origin. This is a hard production blocker: the client cannot currently be pointed at a remote or non-localhost LND endpoint.

### How settlement affects licensing

1. A pending payment is polled against LND.
2. When LND reports `settled`, the offer's `{payment}` block is written with a targeted `jsonb_set` — never a whole-document save, so a concurrent relay acknowledgement cannot be clobbered.
3. On the next poll of the same endpoint, the licence is built, signed by the attestor, and queued.
4. The offer is reported as `PAYMENT_SETTLED` with `licenseIssuance: "pending"`.
5. Only after a relay returns a positive `OK` for the licence event does the offer become `LICENSED` and `licenseIssuance` become `published`.

Payment settled and licence published are deliberately separate states. A buyer whose payment settled but whose licence could not be signed is shown as paid-but-unlicensed with the reason, never as a completed purchase.

### Lightning webhook path: not functional

A webhook endpoint exists at `POST /api/webhooks/lightning`, but it **does not settle payments**. It verifies a Standard Webhooks (svix-style) HMAC signature, normalises the payload, writes a row to `lightning_webhooks`, and returns `200`.

It never marks a payment settled and never issues a licence. It is a receipt archive, not a settlement path — as its own source comment concedes: *"Retained only for the already-existing webhook endpoint while settlement is migrated."*

Two further gaps make it unusable even for archiving:

- Config reads `SPEED_WEBHOOK_SECRET`, and the route hard-codes `provider: 'speed'`. No example or documented environment file sets that variable, so the endpoint returns `503 WEBHOOK_NOT_CONFIGURED`.
- The HMAC scheme is svix/Standard Webhooks. Any other provider's webhook format would be rejected.

### Production considerations

Nothing below exists yet. It is the list of what would have to change:

- **Replace the LND-direct client.** Either a real Lightning node per creator, or a hosted/custodial provider. The current localhost-only URL validation must be relaxed and the macaroon replaced by provider credentials.
- **Decide custodial or non-custodial.** The current design pays the creator's own node directly. A custodial provider instead pays the platform, which then owes the creator — introducing balances, payouts, and settlement that do not exist anywhere in the code.
- **If hosted checkout is chosen**, the frontend must change: the BOLT11 QR (`LightningQR.tsx`) is replaced by a redirect, and settlement arrives by webhook rather than by polling — which means the webhook path above must actually be implemented.
- **TLS, wallet permissions, rate limits, and operational controls** are absent. `rejectUnauthorized: false` is set for LND TLS.
- **No reconciliation exists** for late settlement of an expired invoice, or for a second settlement against an already-licensed offer.

---

## Licensing Engine

The Licensing Engine is the logical core of the application. Everything above it (content) and below it (Nostr, Lightning) exists to feed it or record its output.

```mermaid
sequenceDiagram
    autonumber
    participant C as Creator
    participant F as Frontend<br/>(Next.js)
    participant A as Backend<br/>(Node.js)
    participant P as PostgreSQL
    participant R as Nostr relay
    participant L as LND Creator node
    participant B as Brand

    C->>F: Enter content, brand, price, rights, duration
    C->>F: Sign via NIP-07 extension (auth event + offer event)
    F->>A: POST /api/offers (signed auth)
    A->>P: Insert offer (status draft)
    A-->>F: 201 Offer
    F->>A: POST publish (signed offer event)
    A->>A: Verify signature, kind, attestor, exact terms, timestamp
    A->>P: Queue event in nostr_outbox
    A-->>F: 202 status publishing
    A->>R: Publish offer event, retry until OK
    A->>P: status = published
    R-->>B: Offer event is publicly queryable
    A-->>F: GET offer reports published
    F-->>B: Share the public offer link

    B->>A: POST payment
    A->>L: POST /v1/invoices (value = amount_sats)
    L-->>A: BOLT11 invoice + payment hash
    A->>P: Save pending payment
    A-->>B: Invoice rendered as QR + text

    B->>L: Pay the lnbcrt invoice
    loop Every poll
        B->>A: GET status
        A->>L: GET /v1/invoice/{hash}
        L-->>A: settled + settled_at
        A->>P: Mark payment settled
        A->>A: buildLicenseEvent + finalizeEvent (attestor)
        A->>P: Insert licence, queue licence event
        A-->>B: PAYMENT_SETTLED, licenseIssuance pending
    end

    A->>R: Publish licence event (NOSTR_LICENSE_KIND)
    R-->>A: OK
    A->>P: licence published, offer status licensed
    B->>A: GET offer
    A-->>B: offer + licence record (event id, start, end)
```

### Terms and immutability

Terms are validated before storage and again before publication. A published offer is immutable: re-publishing a different event against an offer that already has an event ID returns `409 OFFER_IMMUTABLE`. Changing terms requires a new offer.

One offer targets one brand and produces at most one licence.

### State machine

```text
Offer:       draft → publishing → published → licensed
Payment:     pending → expired
             pending | expired → settled   (verified LND evidence only)
Licence:     pending → published           (relay acknowledgement)
```

---

## Architecture

### Implemented

```mermaid
flowchart TB
    subgraph Client["Browser — Next.js 14 :3001"]
        NF["NIP-07 signer probe<br/>missing / locked / connected"]
        OF["Offer form"]
        PO["Public offer page"]
        PP["Payment page<br/>QR + status"]
    end

    subgraph API["Node.js API :3000"]
        RT["routes/ + controllers/"]
        SV["services/offers<br/>offer + payment + licence rules"]
        SN["services/nostr<br/>event builders + publisher"]
        SP["services/payments<br/>LND REST client"]
        AU["middleware/auth<br/>kind 27235 signed auth"]
    end

    subgraph Data["PostgreSQL 17"]
        OFF[("offers")]
        LIC[("licenses")]
        OBX[("nostr_outbox")]
        APIREQ[("api_requests")]
        WH[("lightning_webhooks")]
    end

    subgraph External["External"]
        RELAY["Nostr relay<br/>strfry (dev)"]
        LND["LND Creator node<br/>Polar regtest (dev)"]
    end

    OF --> RT
    PP --> RT
    OF --> SV
    SV --> SN
    SV --> SP
    RT --> AU
    SN --> OBX
    SV --> OFF
    SV --> LIC
    RT --> APIREQ
    RT --> WH
    SN -->|"EVENT, await OK"| RELAY
    SP -->|"v1/invoices, v1/invoice"| LND
    OF -.->|"public record"| RELAY

    style Client fill:#EFF6FF,stroke:#2563EB,color:#111827
    style API fill:#F0FDF4,stroke:#16A34A,color:#111827
    style Data fill:#F8FAFC,stroke:#64748B,color:#111827
    style External fill:#FFFBEB,stroke:#D97706,color:#111827
```

### Content architecture

Built. A video is uploaded from the browser straight to Cloudinary, registered against the
creator's Nostr pubkey, and referenced by offers and discovery through a server-resolved
media reference.

```mermaid
flowchart LR
    C[Creator uploads video] --> AUTH["Backend signs upload params<br/>cloudinary.js"]
    AUTH --> UP[Browser uploads directly<br/>bytes never touch the API]
    UP --> CL[(Cloudinary<br/>storage + transforms)]
    UP --> REG["POST /videos<br/>single-use upload session"]
    CL --> REG
    REG --> VID[(videos table<br/>owner = Nostr pubkey)]
    VID --> LIB["Creator library<br/>offer state per video"]
    LIB --> OFF["Offer references video_id<br/>reference resolved server-side"]
    OFF --> ENG["Licensing Engine<br/>(implemented)"]
    ENG --> DISC["Brand discovery<br/>published offers only"]
    VID -.->|"owner only"| DL["Unrestricted original"]

    style C fill:#EFF6FF,stroke:#2563EB,color:#111827
    style AUTH fill:#F0FDF4,stroke:#16A34A,color:#111827
    style UP fill:#EFF6FF,stroke:#2563EB,color:#111827
    style CL fill:#FFFBEB,stroke:#D97706,color:#111827
    style REG fill:#F0FDF4,stroke:#16A34A,color:#111827
    style VID fill:#F8FAFC,stroke:#64748B,color:#111827
    style LIB fill:#EFF6FF,stroke:#2563EB,color:#111827
    style OFF fill:#EFF6FF,stroke:#2563EB,color:#111827
    style ENG fill:#F0FDF4,stroke:#16A34A,color:#111827
    style DISC fill:#EFF6FF,stroke:#2563EB,color:#111827
    style DL fill:#FFFBEB,stroke:#D97706,color:#111827
```

Two notes on what this diagram does and does not claim. The **signed download grant** that
used to sit at the end of this flow is still not built — the dotted line is the owner's own
original, not a post-purchase grant. And `MediaAsset` / `MediaListing` in
`backend/src/models/commerce.js` are **superseded** by the `videos` table; they remain
defined and tested but nothing persists or serves them, and they should not be read as the
shape this system implements.

### Future service boundaries

The Licensing Engine is the natural extraction point. It depends on content only through a reference and a fingerprint, and it owns offer, payment, and licence state. Extracting it — and the content pipeline around it — is possible because every external dependency is constructor-injected.

---

## Tech stack

| Layer | Technology | Version | Notes |
| --- | --- | --- | --- |
| Frontend framework | Next.js (App Router) | `14.2.5` | React `18.3.1` |
| Language | TypeScript | `5.4.5` | `strict: true`, path alias `@/*` |
| Styling | Tailwind CSS | `3.4.4` | Custom design tokens in `tailwind.config.ts` |
| Icons | `lucide-react` | `0.383.0` | |
| QR rendering | `qrcode.react` | `3.1.0` | Lightning BOLT11 QR |
| Backend | Node.js native `node:http` | `>=22` | No web framework |
| Backend language | JavaScript (ESM) | — | Deliberate; see `backend/README.md` |
| Database | PostgreSQL (`pg` `^8.0.0`) | `17-alpine` | Docker Compose |
| Validation | `ajv` | `^8.17.1` | JSON Schema, shared with API contract |
| Nostr | `nostr-tools` | `^2.0.0` | Signing, verification, bech32 |
| Lightning | LND REST over HTTPS | — | Direct client, macaroon auth |
| Authentication | NIP-07 + kind `27235` signed HTTP | — | No sessions, no passwords |
| Video storage and delivery | Cloudinary | — | Direct browser upload, signed upload parameters, watermarked transformations |
| Testing | `node:test` | — | 54 backend tests |
| Containerisation | Docker, Docker Compose | — | PostgreSQL + strfry |
| Relay (dev only) | strfry | `latest` | Local development only |
| Deployment | — | — | **None exists** |

**Not present:** frontend test runner, ESLint configuration, CI workflow, monitoring, analytics.

---

## Project structure

```text
ANZA/
├── compose.yaml                  # PostgreSQL 17 + strfry (dev)
├── strfry.conf                   # Local relay config (dev only)
├── .env                          # Compose var substitution (gitignored)
│
├── frontend/                     # Next.js 14 creator + brand experience
│   ├── app/
│   │   ├── page.tsx              # Landing
│   │   ├── sign-in/page.tsx      # Choose experience / NIP-07 connect
│   │   ├── create/page.tsx       # Creator offer form
│   │   ├── creator-profile/      # Upload + personal video library
│   │   ├── brand-profile/        # Discovery feed over published offers
│   │   └── offers/[offerId]/
│   │       ├── page.tsx          # Public offer AND licensed confirmation
│   │       └── pay/page.tsx      # Invoice, QR, payment status polling
│   ├── components/
│   │   ├── offer/                # OfferForm, ContentPreview, LicenseDetails,
│   │   │                         # VerificationCard
│   │   ├── content/              # UploadVideo (direct-to-Cloudinary upload)
│   │   ├── payment/              # LightningQR, InvoiceDisplay, PaymentStatus
│   │   ├── layout/               # Navbar, Footer
│   │   └── ui/                   # Button, Card, FormFields, StatusBadge,
│   │                             # CopyButton
│   └── lib/
│       ├── api.ts                # Backend client, offer mapping, content calls
│       ├── nostr.ts              # NIP-07 signer, signer probe, auth signing
│       ├── types.ts              # Shared UI types
│       └── licenseTypes.ts       # Licence type labels and default copy
│
└── backend/                      # Node.js API
    ├── docs/                     # Design decisions and generated contract
    │   ├── nostr-events.md       # Event kinds, tags, content, trust model
    │   ├── data-model.md         # Records, state machine, public vs private
    │   ├── extended-data-model.md# Media/order/grant schemas (not persisted)
    │   ├── content-layer.md      # Creator video + discovery design
    │   ├── api-contract.md       # Endpoint contract (see Known gaps)
    │   ├── openapi.json          # Generated from src/contracts/contract.js
    │   ├── day-2.md              # Setup guide
    │   └── local-database.md     # PostgreSQL via Compose
    ├── src/
    │   ├── app.js                # HTTP server, CORS, body limits
    │   ├── server.js             # Composition root + publication worker
    │   ├── config/               # Environment parsing and validation
    │   ├── routes/ controllers/  # offers + content request handling
    │   ├── middleware/auth.js    # Kind 27235 signed HTTP auth
    │   ├── models/               # JSON Schemas (schemas, content, commerce)
    │   ├── validators/           # Schema validation + cross-field rules
    │   ├── contracts/            # OpenAPI contract source
    │   ├── repositories/         # PostgreSQL store (offers, videos)
    │   ├── database/migrations/  # 001_offers.sql, 002_videos.sql
    │   ├── services/
    │   │   ├── content/          # Video registration, library, discovery
    │   │   ├── media/            # cloudinary.js signing + delivery URLs
    │   │   ├── offers/            # Offer, payment, licence workflow
    │   │   ├── nostr/            # events.js, publisher.js, signer.js
    │   │   └── payments/         # lnd-client.js, speed.js
    │   └── utils/                # HttpError
    └── test/                     # 54 tests across 6 files
```

**Boundary notes**

- `services/` holds business rules and never touches SQL; `repositories/` holds SQL and holds no business rules.
- `models/` and `contracts/` are the single source of truth — the same JSON Schemas drive runtime validation and the exported OpenAPI document, so they cannot drift.
- The frontend never imports backend code. `lib/api.ts` owns the `BackendOffer` → `Offer` mapping, which is where the two representations meet.

---

## Quick start

### Prerequisites

- Node.js 22+
- Docker and Docker Compose
- A NIP-07 browser signer (nos2x, Alby, Flamingo) to create offers
- **Optional** — Polar with two LND nodes, only for the payment demo

Offer creation, publication, and licence verification work without Polar. Only `POST /api/offers/:id/payment` requires it.

### 1. Start infrastructure

```bash
docker compose up -d --wait postgres
```

Optional, for local relay and local Lightning:

```bash
docker compose up -d --wait          # also starts strfry on ws://localhost:7777
```

If host port `5432` is already taken, set `POSTGRES_HOST_PORT` in the repository-root `.env` and use the same port in `DATABASE_URL`. Do not stop an unrelated database.

### 2. Configure the backend

Create `backend/.env`. It is gitignored and must never be committed. See [Configuration](#configuration) for the full variable reference.

```env
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://ANZA:change-me@localhost:5432/ANZA

NOSTR_OFFER_KIND=9998
NOSTR_LICENSE_KIND=9999
NOSTR_ATTESTOR_PUBKEY=<64-char hex or npub>
NOSTR_RELAYS=ws://localhost:7777

# Required to issue licences. Must derive to NOSTR_ATTESTOR_PUBKEY.
NOSTR_ATTESTOR_SECRET=<32-byte hex or nsec>

# Optional — only for the local Lightning demo
LND_REST_URL=https://127.0.0.1:<creator-rest-port>
LND_MACAROON=<creator-admin-macaroon-hex>
```

Generate a throwaway attestor keypair for development:

```bash
cd backend
node -e "const {generateSecretKey,getPublicKey}=require('nostr-tools');const sk=Buffer.from(generateSecretKey()).toString('hex');console.log('NOSTR_ATTESTOR_SECRET='+sk);console.log('NOSTR_ATTESTOR_PUBKEY='+getPublicKey(Buffer.from(sk,'hex')));"
```

### 3. Run migrations

```bash
cd backend && npm install && npm run migrate
```

All `*.sql` files in `backend/src/database/migrations/` are applied in order and recorded in a `schema_migrations` table. Re-running is a no-op. On a brand-new Compose volume both migrations are also applied automatically by `docker-entrypoint-initdb.d`.

### 4. Configure the frontend

```bash
cp frontend/.env.example frontend/.env
```

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_NOSTR_OFFER_KIND=9998
NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY=<must match backend NOSTR_ATTESTOR_PUBKEY>
NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS=3000
```

`NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY` must equal the backend's attestor public key or offer publication is rejected. Never put a private key or macaroon in the frontend environment. Restart the dev server after changing any `NEXT_PUBLIC_*` value — Next.js inlines them at build time.

### 5. Run

```bash
cd backend && npm start        # :3000
cd frontend && npm run dev    # :3001
```

Open <http://localhost:3001>.

### 6. Lightning demo (optional, development only)

Using Polar with **two** LND nodes in the same regtest network:

1. Start the network, then start the **Creator** and **Buyer** LND nodes.
2. Fund **Buyer** with regtest sats.
3. Open and confirm a channel from **Buyer → Creator**.
4. Publish an offer, open its public link, choose **Purchase License**.
5. Pay the `lnbcrt...` invoice from **Buyer**.
6. The pay page polls the backend; the backend queries Creator's LND and reports payment only after settlement.

> [!WARNING]
> Polar uses private **regtest** Bitcoin. `lnbcrt...` invoices exist only inside that network and cannot be paid by a normal wallet or a public testnet wallet. **No real funds move.** Never point production credentials at a Polar endpoint.

---

## Configuration

### Application

| Variable | Required | Purpose | Example | Notes |
| --- | :---: | --- | --- | --- |
| `HOST` | No | Bind address | `127.0.0.1` | Defaults to `127.0.0.1` |
| `PORT` | No | API port | `3000` | Defaults to `3000` |
| `PUBLIC_ORIGIN` | No | Absolute origin used to bind signed auth and construct URLs | `http://localhost:3000` | Must have no path or credentials |
| `CORS_ORIGIN` | No | Intended CORS allowlist | `https://app.example.com` | **Currently ignored** — see [Known gaps](#known-gaps) |

### Database

| Variable | Required | Purpose | Example | Notes |
| --- | :---: | --- | --- | --- |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `postgresql://ANZA:change-me@localhost:5432/ANZA` | Fails fast if unset |
| `POSTGRES_HOST_PORT` | No | Compose host port for PostgreSQL | `5432` | Read from repository-root `.env` by Compose, not by the app |
| `TEST_DATABASE_URL` | No | Enables the PostgreSQL integration test | `postgresql://.../scratch` | Test creates and drops its own schema |

### Nostr

| Variable | Required | Purpose | Example | Notes |
| --- | :---: | --- | --- | --- |
| `NOSTR_OFFER_KIND` | **Yes** | Event kind for offers | `9998` | Must be an integer in `1000–9999`. No default |
| `NOSTR_LICENSE_KIND` | No | Event kind for licence events | `9999` | Same range. Unset disables licence issuance |
| `NOSTR_ATTESTOR_PUBKEY` | **Yes** | Public key allowed to attest settlement | `7c2ce4db…` or an `npub` | Declared inside every offer event |
| `NOSTR_ATTESTOR_SECRET` | No | Attestor private key | `<nsec1…>` or 32-byte hex | Required for licence issuance. Must derive to the public key above. `ncryptsec` is rejected |
| `NOSTR_RELAYS` | **Yes** | Comma-separated relay URLs | `ws://localhost:7777` | `wss://`, or `ws://` on localhost only |

### Lightning

| Variable | Required | Purpose | Example | Notes |
| --- | :---: | --- | --- | --- |
| `LND_REST_URL` | No | LND REST origin | `https://127.0.0.1:8081` | **Validated as localhost HTTPS only** |
| `LND_MACAROON` | No | LND admin macaroon, hex-encoded | `<hex string>` | Unset disables the payment provider entirely |
| `SPEED_WEBHOOK_SECRET` | No | HMAC secret for the webhook endpoint | `wsec_<base64>` | Endpoint is non-functional regardless — see [Lightning](#lightning-implementation) |

### Frontend

| Variable | Required | Purpose | Example |
| --- | :---: | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | No | Backend base URL | `http://localhost:3000/api` |
| `NEXT_PUBLIC_NOSTR_OFFER_KIND` | No | Must match backend offer kind | `9998` |
| `NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY` | **Yes** | Must match backend attestor pubkey | 64-char hex |
| `NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS` | No | Payment poll interval | `3000` |

### Cloudinary (video)

All four are **optional**. If any one of the first three is missing, the content layer is
disabled: the video endpoints return `501 CONTENT_NOT_CONFIGURED` and the Licensing Engine
keeps working, the same way an unconfigured LND wallet does.

| Variable | Required | Purpose | Example | Notes |
| --- | :---: | --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | **Yes** for video | Cloud identifier from the console | `dgiocioqk` | Must match `/^[A-Za-z0-9_-]{1,64}$/` |
| `CLOUDINARY_API_KEY` | **Yes** for video | Public API key | `679551628553288` | Must carry **upload** permission |
| `CLOUDINARY_API_SECRET` | **Yes** for video | Signing secret | `<secret>` | Never returned to a client; only used to sign |
| `CLOUDINARY_FOLDER` | No | Destination folder | `ANZA/videos` | Defaults to `ANZA/videos` |

> [!IMPORTANT]
> The API key must be able to **upload**, not merely read the Media Library. A
> Media-Library-only key authenticates successfully and then fails with
> `missing permissions (actions=["create"])`. Use Media Library Admin or Admin.
>
> The signed parameter string deliberately excludes `resource_type`, `api_key`,
> `cloud_name` and `file` — Cloudinary rebuilds the signature from the request and rejects
> any upload where the two strings differ. `resource_type` travels in the URL path
> (`/v1_1/{cloud}/video/upload`), not as a request parameter.

### Other integrations

**None.** There is no transcoding service of our own, no separate watermarking pipeline, no CDN, analytics, or email integration configured. Video storage and transformations are Cloudinary's. `BITNOB_*` keys appear in some developers' local `backend/.env` but **no source file reads them**; treat them as untracked exploration, not configuration.

---

## Usage

### Creator — creating an offer, implemented

1. Open `/create`, enter title, description, brand, price in sats, licence type, and rights, and select a video from your library.
2. The form validates locally, then shows a preview. When a video is selected, the media reference and fingerprint are resolved server-side from the video record.
3. On publish, the NIP-07 extension is probed. A missing or locked extension is reported with instructions and a **Retry** button; publishing is blocked until signing is available.
4. The offer event is signed in the browser, submitted, verified server-side, queued, and published to the relay.
5. The creator is redirected to the public offer page and shares the link.

The creator can be offline once the offer is published; the licence is signed by the platform attestor, not the creator.

### Creator — upload and library, implemented

1. Open `/creator-profile` and authenticate with the NIP-07 extension. A missing or locked extension is reported with instructions and a **Retry** button.
2. Upload a video from the device. The backend signs the Cloudinary upload parameters, and the browser uploads straight to Cloudinary — the bytes never pass through the application server.
3. The returned asset is registered against your Nostr pubkey, consuming a single-use upload session.
4. The video appears in your library with its watermarked preview, thumbnail, and real offer state: `No Offer`, `Draft`, or `Available`.
5. Select a video and create an offer for it. The media reference and fingerprint are resolved **server-side** from the video record — you cannot override them from the browser.

### Brand / client — discovery, implemented

1. Open `/brand-profile` to browse the discovery feed, which is built from published offers only.
2. Filter and review offers, each showing watermarked previews and the creator's Nostr handle.
3. Select an offer to open its public page, where you review the content reference, terms, price, and offer event ID.

There is no brand account and no buyer login yet — see [Not implemented](#not-implemented).

### Brand / client — payment, implemented

1. On the offer page, choose **Purchase License**.
2. A BOLT11 invoice is created for the exact offer amount and shown as a QR code and copyable string.
3. Pay the invoice.
4. The page polls and shows one of four honest states: *waiting for payment* → *payment received, issuing your licence* → *licensed*, or *paid but the licence could not be issued* with the reason.
5. On the offer page, the licensed view shows the licence event ID, a relay link, and the licence term.

---

## Development

Only scripts that exist are documented.

### Backend (`backend/package.json`)

| Command | Purpose |
| --- | --- |
| `npm start` | Start the API and publication worker with `.env` loaded |
| `npm test` | Run all tests with `node:test` |
| `npm run migrate` | Apply all `*.sql` migrations |
| `npm run contracts` | Regenerate `docs/openapi.json` from `src/contracts/contract.js` |

### Frontend (`frontend/package.json`)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on `:3001` |
| `npm run build` | Production build (runs TypeScript checking) |
| `npm run start` | Serve the production build |
| `npm run lint` | **Not usable** — no ESLint config exists; `next lint` prompts interactively |
| `npx tsc --noEmit` | Type checking (works) |

### Formatting

No formatter is configured. There is no `.prettierrc` and no formatting script.

### Before opening a pull request

```bash
cd backend && npm test
cd ../frontend && npx tsc --noEmit
```

`npm run build` also type-checks but additionally fetches Google Fonts via `next/font`, so it fails without network access. Use `tsc --noEmit` for an offline check.

> **Do not run `npm run build` while `npm run dev` is running.** Both use `frontend/.next`; concurrent use corrupts it and produces `Cannot find module './vendor-chunks/...'`. If it happens, stop the dev server, delete `frontend/.next`, and restart.

---

## Testing

54 backend tests, 52 passing, 2 skipped. There are **no frontend tests**.

| File | Coverage |
| --- | --- |
| `backend/test/data-schemas.test.js` | Terms validation, offer and licence event construction, expiry arithmetic, rejection of mismatched settlements |
| `backend/test/day2.test.js` | Offer creation, publish validation, payment and invoice reuse, settlement recording, licence issuance and single-issue guarantees, offer record carrying the licence, signed HTTP auth, config validation |
| `backend/test/content.test.js` | Content-layer ownership, Cloudinary upload authorisation and signature construction, single-use upload sessions, video registration, offer linkage, discovery filtering |
| `backend/test/contracts.test.js` | Exported OpenAPI matches source; schema references resolve |
| `backend/test/lnd-client.test.js` | LND invoice creation, settlement lookup, macaroon gating |
| `backend/test/postgres.test.js` | Transactions, idempotency, outbox retry and acknowledgement — **skipped unless `TEST_DATABASE_URL` is set** |

Real cryptographic operations are exercised, not stubbed: tests sign with `nostr-tools` `finalizeEvent` and verify with `verifyEvent`, and the LND tests run against the real client with an injected transport.

The Cloudinary signature is pinned against the exact string to sign, so a change to the
signed parameter set fails a test rather than only surfacing as a `401` in production.

### What is not covered

- **No frontend tests at all** — no unit, component, or end-to-end tests. The pay page polling, status mapping, upload flow, and licensed rendering are untested.
- **No staging or cross-service tests.**
- **The PostgreSQL integration test skips by default**, so transactions and outbox retry are unverified in a normal `npm test` run.
- **Payment coverage uses an injected fake LND transport.** No test settles a real regtest invoice; the manual Polar walkthrough in [Quick start](#quick-start) is the only end-to-end payment check.
- **No real Cloudinary upload is tested.** The signature is verified against the documented algorithm, not against the live API; key permissions and folder creation are only confirmed manually.
- **No CI workflow** in the repository.

---

## Environments: local, staging, production

> **Staging does not exist in this repository.** There is no staging deployment, no CI, and no environment promotion tooling. Everything below describes what exists and what would be required.

### Local development

The only environment that currently runs.

- Application: Next.js on `:3001`, Node.js API on `:3000`, both on the developer machine
- Database: PostgreSQL 17 in Docker Compose, credentials `ANZA:change-me`
- Lightning: **Polar regtest** with LND Creator and Buyer nodes on the developer's machine
- Nostr: local **strfry** relay at `ws://localhost:7777`, no auth, accepts everything
- Secrets: local `.env` files, gitignored
- Storage and video assets: **none**

> [!CAUTION]
> **Regtest funds are not real funds, and regtest payments are not real payments.** Polar's Bitcoin chain is private and disposable. An `lnbcrt...` invoice has no value outside that network and cannot be paid by any public wallet. A successful regtest payment is a test result and must never be presented as revenue, and a Polar endpoint must never be configured with production credentials.

### Staging / test — recommended, not implemented

There is no staging deployment. If one is added it should mirror production architecture as closely as practical while staying isolated from every production resource:

| Separation | Requirement |
| --- | --- |
| Application | Separate deployment; never the same instance as production |
| Database | Separate instance or at minimum a separate database and credentials |
| Secrets | Separate secret store entries; no overlap with production |
| Nostr relays | A dedicated staging relay set, so test offers and test licences never enter the production relay set |
| Lightning | An isolated test environment — a provider sandbox where available, otherwise a separate regtest network. **Never production payment credentials** |
| Storage and video | Separate bucket or container; test assets must not leak into production |

**The Nostr risk is the sharpest.** A staging offer published to a production relay is public and permanent. It cannot be recalled, and it will show up in queries against production event kinds. Staging therefore needs its own relay, and the relay kind values should differ from production so the two event sets cannot be confused.

**The Lightning risk is money.** The single most important control is that production payment credentials never appear in a staging or local configuration. A staging deployment pointed at production payment infrastructure can create real, irreversible payments during a test.

### Production

Required, none of which exists today:

- Production application deployment behind HTTPS
- Production PostgreSQL with backups and access control
- Production secrets management — no secrets in the image or repository
- A production Nostr relay set over `wss://`
- Real Lightning infrastructure able to process real payments, and a decision on custodial versus non-custodial
- Object storage, transcoding, and watermarking for the content layer
- Monitoring, logging, alerting, and rate limiting — **none of which exist today**
- A chosen open-source licence

---

## Environment configuration matrix

Cells describe requirements, not deployed technology. Only the Local column reflects anything that exists.

| Component | Development | Staging | Production |
| --- | --- | --- | --- |
| Application | Local (`next dev` + `node src/server.js`) | Separate deployment | Separate deployment |
| Database | Docker Compose PostgreSQL 17 | Staging database | Production database |
| Lightning | Polar regtest + LND | Isolated test or sandbox environment | Real Lightning infrastructure |
| Payments | Test only — no real value | Test only — no real value | Real payments |
| Nostr | strfry, `ws://localhost:7777` | Staging-specific relay set | Production `wss://` relay set |
| Storage | None | Staging bucket | Production bucket |
| Secrets | Local `.env`, gitignored | Staging secret store | Production secret store |
| Video assets | None | Staging assets | Production assets |
| Monitoring | None | Required | Required |

---

## Promotion and deployment flow

Intended progression. Only the first two steps exist.

```text
Development (local Compose + Polar + strfry)
        ↓
Pull Request
        ↓
Automated tests        ← not implemented: no CI exists
        ↓
Staging                ← not implemented
        ↓
Integration / acceptance testing
        ↓
Production
```

The principle this enforces: **a change is proven against staging infrastructure before it is ever connected to production payment or relay credentials.** Because both Nostr publication and Lightning settlement are irreversible in production, the environment doing the proving must be isolated from the environment holding the money and the permanent record.

At minimum, before production:

1. `npm test` and `npx tsc --noEmit` pass.
2. The full Licensing Engine has been walked through on staging.
3. Staging Nostr and Lightning credentials are confirmed isolated from production.
4. Secrets have been rotated out of any local environment used during development.

---

## Payment safety

> [!WARNING]
> **Lightning payment configuration is environment-sensitive. A misconfigured environment can create real, irreversible payments, or publish permanent public records.**

Rules that follow from the implementation:

- **Polar/regtest is not production.** It is a private, disposable Bitcoin network. Never point production credentials at it, and never present a regtest payment as a real one.
- **Test invoices must not be confused with real payments.** An `lnbcrt...` invoice is not a Bitcoin payment. Only an invoice on a real network settles real value.
- **Production payment credentials must never be committed.** `.env` files, macaroons, Nostr `nsec` keys, and provider secrets are gitignored in this repository. Keep it that way, and rotate any secret that was ever committed.
- **Production payment endpoints must not be used during development.** The `LND_REST_URL` validator rejects non-localhost origins, which is a safeguard — do not weaken it without a replacement control.
- **Payment is never marked settled by the client.** The frontend cannot set a paid state. `GET /api/offers/:offerId/status` queries LND directly, and the LND response must echo a matching `r_hash` before it is trusted (`lnd-client.js:43-44`).
- **A licence is never issued from an unverified settlement.** `buildLicenseEvent` independently re-checks the offer event ID, amount, attestor key, and settlement ordering against the offer on record, and throws rather than attesting a mismatch.
- **Staging must not issue real creator licences using unintended production payments.** A staging licence is a real signed Nostr event; publishing it to a production relay set makes it permanent and publicly visible.
- **Webhook deliveries are not settlement evidence.** The webhook endpoint currently persists events without settling them. Any future settlement path must authenticate the notification and reconcile invoice details before changing state.

---

## Nostr environment isolation

Relay configuration is not a cosmetic setting. A Nostr event published to a relay is public, indexed, and effectively permanent. ANZA writes directly to whatever `NOSTR_RELAYS` names.

```text
NOSTR_RELAYS=ws://localhost:7777          # development — strfry, disposable
NOSTR_RELAYS=wss://relay1.example,wss://relay2.example   # production
```

Rules:

- **Development uses a local relay.** `strfry` in `compose.yaml` accepts everything and retains nothing of value. Nothing written there escapes the developer's machine.
- **Staging needs its own relay.** Sharing the production relay set means test offers and test licences become permanent public records. Use a dedicated relay, and ideally different `NOSTR_OFFER_KIND` / `NOSTR_LICENSE_KIND` values so staging events are trivially distinguishable from production ones.
- **Production uses `wss://` only.** Startup validation already rejects plain `ws://` on a non-localhost host, so a production misconfiguration fails fast rather than sending events in cleartext.
- **Event kinds are environment-scoped.** Because there is no default kind, staging and production can each select their own, avoiding cross-environment event confusion.

**Known configuration weakness:** the relay list is currently identical in shape across environments and is set by a single variable with no per-environment profile. Developers switching between staging and production by hand-editing one `.env` is error-prone. Per-environment configuration files, or an explicit environment name that selects a relay set, would remove that risk.

---

## Deployment considerations

**No production deployment exists in this repository.** There are no Dockerfiles for the application, no CI/CD workflow, no infrastructure-as-code, and no hosting configuration. `compose.yaml` is a local development convenience.

Work required before a production deployment:

| Area | Gap |
| --- | --- |
| Containerisation | No Dockerfile for the frontend or backend |
| CORS | Only `http:` on localhost is allowed. `CORS_ORIGIN` is parsed but never used, so a deployed HTTPS frontend would be rejected by the browser |
| HTTPS | No TLS termination or redirect handling |
| Lightning | LND client is localhost-only; no production provider |
| Secrets | No secret manager integration; `.env` files are the only mechanism |
| Database | No migration-at-deploy step, no backup or restore procedure |
| Migrations | Migrations are a manual `npm run migrate`; a release pipeline must run them |
| Monitoring | No structured logging, metrics, health check endpoint, or alerting |
| Rate limiting | None. Public endpoints such as `POST /payment` are unauthenticated and unthrottled |
| Licensing | No open-source licence has been chosen |

---

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request.

> **This file does not exist yet.** It is a tracked gap — see [Known gaps](#known-gaps). Until it does, please follow the checks in [Development](#development) and the safety rules in [Payment safety](#payment-safety).

Contributions that would be genuinely useful: protocol review, Lightning provider integration, frontend test coverage, accessibility, creator research, and documentation.

Please do not commit `.env` files, macaroons, Nostr private keys, payment credentials, or generated local binaries.

---

## License

AGPL 3.0



---

## Team

Roles are the team's own assignment. Commit counts are derived separately from `git log` authorship across all branches. The two signals are independent: a role does not imply commits, and commits do not imply a role. The repository records no mapping between GitHub handles and names, so a handle is shown against a name only where the team has confirmed it.

| Name | Role | Contribution |
| --- | --- | --- |
| **Nady** (`KoskeiNady`) | **Frontend Lead** | Owns the frontend: Next.js scaffold and TypeScript setup, landing page, navigation and footer, form fields, create-offer form, creator profile, brand profile, sign-in, video upload, public offer page, payment page, BOLT11 QR, invoice display, content preview, status badges, licence confirmation, frontend `.env.example` |
| **Aisha** (`Aishagojo`, `Aishaomar`) | **Backend Lead** | Owns the backend: Nostr offer publishing, PostgreSQL and Docker database, live Nostr offer publishing, frontend/backend integration, Polar Lightning payments and settlement tracking. Authored merges for PRs #1–#5 |
| **Irene** (`Irene Mukii`) | **Product Owner & Fullstack Developer** | NIP-07 signer detection and local relay setup, migration runner correctness, signed licence issuance on settlement, licence-record display and payment-state correctness fixes |
| **Jennifer** | **Frontend** | built the public face of the app and its theme |
| **Miriam** | **Product Marketing & Communications Lead** | Marketing and communications. This work is not code, so it does not appear in `git log` |



| Handle | Commits |
| --- | --- |
| `KoskeiNady` | 54 |
| `Irene Mukii` | 24 |
| `Aishagojo` | 10, plus 5 merge commits |
| `Bleuhack` | 4 |



Collaboration was structured through pull requests against `main` (`nady-front` → PR #1 and #2, `integration/frontend-backend` → PRs #3 and #4, `feat/lightning-payment-settlement` → PR #5, `add-footer` → PR #6), with the frontend and backend developed in parallel and integrated repeatedly.

---


