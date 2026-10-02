<div align="center">

# ContentPort

### Creator-owned licensing offers, verifiable on Nostr and payable over Lightning.

[![MVP](https://img.shields.io/badge/status-MVP-16A34A?style=for-the-badge)](#what-works-today)
[![Nostr](https://img.shields.io/badge/Nostr-signed%20offers-7C3AED?style=for-the-badge)](#verifiable-offers)
[![Lightning](https://img.shields.io/badge/Lightning-regtest%20payments-F59E0B?style=for-the-badge)](#lightning-demo)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](#local-development)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](#architecture)

**Your content. Your terms. A record that does not live only in a chat thread.**

</div>

> [!IMPORTANT]
> ContentPort is an open-source MVP built for creators who need a clearer way to offer branded content, set licensing terms, and keep independently verifiable evidence of what they offered.

## The problem

UGC creators in Kenya often agree to brand work through WhatsApp, Instagram DMs, or verbal conversations. The price, usage rights, duration, and payment expectation are fragmented across private messages. If a brand goes silent or an intermediary withholds payment, the creator may have no durable record of the original offer.

Creators also spend too much time waiting to be discovered. ContentPort gives them a way to make a specific, priced licensing offer first and share it directly with the intended brand.

## The solution

ContentPort turns a creator's offer into a shareable, signed record:

1. A creator enters the content reference, target brand, price in sats, rights, and duration.
2. The creator signs the offer in their browser using a Nostr signer extension.
3. ContentPort verifies the signature, stores workflow state in PostgreSQL, and publishes the signed offer to configured Nostr relays.
4. The creator shares the public offer link with a brand.
5. The brand receives a Lightning invoice for the exact offer amount and pays it directly to the Creator node.
6. ContentPort checks the Lightning invoice settlement and updates the public payment state.

```mermaid
flowchart LR
    C[Creator] -->|Sets price & license terms| F[ContentPort offer form]
    F -->|NIP-07 signature| A[Node.js API]
    A -->|Persist workflow state| P[(PostgreSQL)]
    A -->|Signed event| N[Nostr relays]
    F -->|Share link| B[Brand]
    B -->|Pay invoice| L[Lightning Creator node]
    L -->|Settlement lookup| A
    A -->|Payment received| O[Public offer status]

    style C fill:#ede9fe,stroke:#7c3aed,color:#111827
    style F fill:#dbeafe,stroke:#2563eb,color:#111827
    style A fill:#dcfce7,stroke:#16a34a,color:#111827
    style P fill:#e0f2fe,stroke:#0284c7,color:#111827
    style N fill:#f3e8ff,stroke:#9333ea,color:#111827
    style B fill:#ffedd5,stroke:#ea580c,color:#111827
    style L fill:#fef3c7,stroke:#d97706,color:#111827
    style O fill:#dcfce7,stroke:#16a34a,color:#111827
```

## What works today

| Capability | Status | What it does |
| --- | :---: | --- |
| Creator offer form | ✅ | Captures title, description, public content URL, brand, sats price, rights, and duration. |
| Browser-based Nostr signing | ✅ | Uses a NIP-07 browser signer so private keys stay out of ContentPort. |
| Signed API authentication | ✅ | Binds authenticated creator requests to method, URL, body, and idempotency key. |
| Nostr offer publication | ✅ | Verifies an offer event, queues it durably, and retries relay publication until acknowledged. |
| Public offer link | ✅ | Lets a brand review the exact content reference, terms, price, and Nostr event ID. |
| PostgreSQL workflow storage | ✅ | Stores offers, idempotent requests, and the Nostr outbox locally through Docker Compose. |
| Lightning invoice | ✅ | Creates a BOLT11 invoice from the offer's exact sats amount through a local Polar LND Creator node. |
| Lightning settlement detection | ✅ | Looks up the invoice at LND and updates the UI only after LND reports settlement. |
| Payment QR and status UI | ✅ | Shows the price, Lightning QR/invoice, pending state, and confirmed payment state. |
| Signed Nostr license event after payment | ✅ | After verified Lightning settlement, ContentPort signs a linked license event, queues it for relay publication, and records the license after relay acknowledgement. |

## Why this matters

| For creators | For brands |
| --- | --- |
| Set the price and usage rights before sharing work. | Review a single offer with clear rights, duration, and price. |
| Share a direct link instead of relying on a long DM history. | Pay the exact stated amount using Lightning. |
| Retain a signed, portable offer record. | Reference the offer event and payment state later. |
| Receive the license fee directly to the Creator Lightning node. | Avoid ambiguity about the asset and license being purchased. |

## Verifiable offers

ContentPort uses a configured experimental regular Nostr event kind for the current MVP. The offer event includes:

- Creator public key and cryptographic signature
- Content reference and SHA-256 fingerprint
- Brand, price in sats, usage rights, and duration
- ContentPort settlement-attestor public key
- Versioned event schema: `contentport.offer.v1`

The backend verifies the signed event before publication. It does not manufacture a creator signature or accept a changed offer after an event ID has been assigned.

> [!NOTE]
> Nostr proves that a key signed a specific event. It does not by itself prove a real-world identity, brand authority, legal enforceability, or permanent relay retention. ContentPort presents verifiable technical evidence; parties should still use terms appropriate to their agreement.

## Lightning demo

The repository supports a safe, local Lightning demonstration with [Polar](https://lightningpolar.com/) and two LND nodes in the **same Polar network**:

- **Creator** receives the invoice payment.
- **Buyer** funds and pays the invoice.

1. Fund **Buyer** with regtest sats in Polar.
2. Open and confirm a Lightning channel from **Buyer** to **Creator**.
3. Create and publish a ContentPort offer.
4. Open its public link and select **Purchase License**.
5. Copy the `lnbcrt...` invoice or scan its QR code from Buyer.
6. Pay it from **Buyer → Payments**.
7. The payment page polls the backend; the backend checks Creator LND and shows **Payment received** only after settlement.

> [!WARNING]
> Polar uses private **regtest** Bitcoin. `lnbcrt...` invoices are demo invoices and cannot be paid from a normal wallet or a public testnet wallet. No real funds move in this setup.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Next.js frontend :3001                        │
│  Create offer • NIP-07 signing • Public offer • QR payment screen    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼───────────────────────────────────────┐
│                          Node.js backend :3000                        │
│  Auth • validation • offer API • Nostr outbox • LND invoice lookup   │
└──────────────┬───────────────────────────────┬───────────────────────┘
               │                               │
      ┌────────▼────────┐             ┌────────▼─────────┐
      │ PostgreSQL :5432│             │ Nostr relays      │
      │ Offers + outbox │             │ Signed offer event│
      └─────────────────┘             └──────────────────┘
               │
      ┌────────▼─────────────────────────────────────────┐
      │ Polar LND Creator node                             │
      │ BOLT11 invoice creation + settlement verification  │
      └───────────────────────────────────────────────────┘
```

### Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | Next.js 14, React 18, TypeScript | Creator flow, public offers, payment interface |
| UI | Tailwind CSS, Lucide, `qrcode.react` | Responsive screens, icons, Lightning QR code |
| Backend | Node.js 22, native HTTP modules | Validation, API, workflow coordination |
| Database | PostgreSQL 17 via Docker Compose | Offers, idempotency records, relay outbox |
| Nostr | `nostr-tools`, NIP-07 signer | Event signing and verification |
| Payments | LND REST API through Polar | BOLT11 invoice creation and settlement lookup |
| Testing | Node test runner | Contract, validation, Nostr, LND, and persistence tests |

## API at a glance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/offers` | Create a signed creator-owned offer draft. |
| `GET` | `/api/offers/:offerId` | Read a public published offer. |
| `POST` | `/api/offers/:offerId/publish` | Validate and queue the signed Nostr offer event. |
| `POST` | `/api/offers/:offerId/payment` | Create or reuse the offer's Lightning invoice. |
| `GET` | `/api/offers/:offerId/status` | Check LND settlement and return offer/payment status. |

Full backend contracts live in [`backend/docs/openapi.json`](backend/docs/openapi.json) and [`backend/docs/api-contract.md`](backend/docs/api-contract.md).

## Local development

### Prerequisites

- Node.js **22+**
- Docker and Docker Compose
- A Nostr NIP-07 signer extension, such as nos2x, for creating offers
- Polar with a Creator LND node for the Lightning demo

### 1. Start PostgreSQL

```bash
docker compose up -d --wait postgres
```

### 2. Configure backend environment

Create `backend/.env`. Never commit it.

```env
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://contentport:change-me@localhost:5432/contentport

# Development event configuration
NOSTR_OFFER_KIND=9998
NOSTR_ATTESTOR_PUBKEY=<your-npub-or-64-character-hex-public-key>
NOSTR_RELAYS=<comma-separated-wss-relay-urls>

# Polar Creator node only — keep this local and private
LND_REST_URL=https://127.0.0.1:<creator-rest-port>
LND_MACAROON=<creator-admin-macaroon-in-hex>
```

### 3. Configure frontend environment

```bash
cp frontend/.env.example frontend/.env
```

Set `NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY` to the same **public** attestor key configured for the backend. Never put a Nostr private key or LND macaroon in the frontend environment.

### 4. Install and run

In separate terminals:

```bash
cd backend
npm install
npm start
```

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

### Verify the build

```bash
cd backend && npm test
cd ../frontend && npm run build
```

## Repository layout

```text
contentport/
├── frontend/                 # Next.js creator and brand experience
│   ├── app/                  # Create offer, public offer, and payment pages
│   ├── components/           # UI, offer, layout, and payment components
│   └── lib/                  # API client, Nostr signer, and shared types
├── backend/                  # Node.js API and business rules
│   ├── src/
│   │   ├── services/nostr/   # Event builders and relay publisher
│   │   ├── services/payments/# Polar LND client
│   │   ├── services/offers/  # Offer and payment workflow
│   │   ├── repositories/     # PostgreSQL persistence
│   │   └── database/         # SQL migrations
│   ├── test/                 # Unit and integration coverage
│   └── docs/                 # API, data model, and protocol notes
├── compose.yaml              # Local PostgreSQL service
└── README.md                 # Project overview
```
DEV VS PRODUCTION NOTES
strfry.conf + the strfry service in compose.yaml are local development only. Production points NOSTR_RELAYS at third-party wss:// relays.

## Security and privacy principles

- **Private keys stay in the signer.** The frontend requests NIP-07 signatures; it does not collect or transmit a creator's private key.
- **Secrets stay local.** `.env` files, LND macaroons, database credentials, and tunnel tokens must never be committed.
- **Terms are validated before storage or publication.** Invalid prices, missing fields, contradictory durations, and unsafe content URLs are rejected.
- **Offer publication is durable.** A PostgreSQL outbox retries relays and does not report success until a relay acknowledges the exact event ID.
- **Payment status comes from LND.** The UI does not mark an invoice paid merely because a buyer clicked a button.

## Roadmap

- [ ] Add protected original-file delivery with one-time download access.
- [ ] Support public testnet/mainnet Lightning with production-grade TLS, wallet permissions, and operational controls.
- [ ] Add buyer acceptance and brand identity workflows.
- [ ] Add creator offer history and license management.
- [ ] Publish contribution guidelines and select an open-source license.

## Contributing

This is a hackathon MVP moving toward an open-source project. Useful contributions include protocol review, Lightning reliability, UX/accessibility improvements, creator research, tests, and documentation.

Before opening a pull request:

```bash
cd backend && npm test
cd ../frontend && npm run build
```

Please do not commit `.env` files, macaroons, private keys, access tokens, or generated local binaries.

---

<div align="center">

Built for creators who should be able to say: **this is my work, these are my terms, and this is the record.**

</div>
