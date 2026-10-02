# ContentPort backend

For a local database without Supabase, follow [PostgreSQL with Docker Compose](docs/local-database.md).

Day 1 defines the data and protocol contracts. Day 2 adds offer creation, PostgreSQL persistence, signed request authentication, and queued Nostr publication. See the [Day 2 setup guide](docs/day-2.md). The content layer adds creator-owned video records, direct-to-Cloudinary upload, and brand discovery. See the [content layer guide](docs/content-layer.md).

## Run the Day 1 checks

Requires Node.js 22 or newer and npm.

```bash
cd backend
npm install
npm test
npm run contracts
```

The offer API, publication worker and payment integration are implemented. Dependency installation remains pending; see the Day 2 guide for the exact setup requirements.

PostgreSQL integration tests run when `TEST_DATABASE_URL` is set:

```bash
cd backend
TEST_DATABASE_URL="postgresql://contentport:change-me@localhost:5433/contentport" npm test
```

## Start here

| Deliverable | Documentation | Code |
| :--- | :--- | :--- |
| Data structures | [Data model](docs/data-model.md) | [Shared schemas](src/models/schemas.js) |
| API contracts | [API guide](docs/api-contract.md), [OpenAPI JSON](docs/openapi.json) | [Contract source](src/contracts/contract.js) |
| Nostr event structure | [Event design](docs/nostr-events.md) | [Event builders](src/services/nostr/events.js) |
| Creator video and discovery | [Content layer](docs/content-layer.md) | [Content service](src/services/content/service.js), [Cloudinary](src/services/media/cloudinary.js) |

```text
backend/
├── docs/            # Day 1 decisions, content layer guide, generated OpenAPI
├── scripts/         # Contract export
├── src/
│   ├── models/      # Data schemas
│   ├── validators/  # Request and data validation
│   ├── contracts/   # API contract definitions
│   ├── controllers/ # Offer and content request handlers
│   ├── routes/      # Offer and video endpoint matching
│   ├── middleware/  # Signed HTTP authentication
│   ├── repositories/ # PostgreSQL offer and content persistence
│   ├── database/    # SQL migrations
│   ├── config/      # Environment configuration
│   ├── utils/       # Shared error types
│   └── services/
│       ├── offers/  # Offer creation and publication rules
│       ├── content/ # Creator video registration and library rules
│       ├── media/   # Cloudinary signing and delivery references
│       ├── payments/# Polar LND client and webhook verification
│       └── nostr/   # Event builders and relay publisher
├── test/            # Validation, protocol contract and integration tests
├── index.js         # Package exports, not a server entry point
└── package.json
```

The initial code uses JavaScript modules to match the existing repository and run directly on Node. TypeScript and Fastify remain proposed choices for the application implementation. JSON Schemas are shared between validation and API documentation to avoid maintaining two incompatible definitions.

Controllers handle offer and content requests, routes match their URLs, services enforce the rules, and repositories persist data. `src/server.js` starts the HTTP server and publication worker. The content store extends the offer store, so both share one connection, one idempotency implementation and one outbox.

## Content layer

A video is content a creator owns. It exists before any offer; the offer stays the licensing entity and references the video by id.

```text
Creator (Nostr key 27235 auth)
  -> videos.owner_public_key    ownership decided by the database query
  -> videos row                 Cloudinary asset plus watermarked preview
  -> videoId
  -> existing Offer engine      Terms, offer event, Lightning invoice, license event
```

The content layer does not implement offers, payments, licenses or Nostr
publication. It supplies one thing: the content an offer refers to.

### Endpoints

Base path `/api`. Every video route requires signed Nostr authorization, and
every POST requires an `Idempotency-Key`.

| Method and path | Purpose | Access |
| :--- | :--- | :--- |
| `POST /videos/upload-authorization` | Sign Cloudinary upload parameters for one direct upload | Creator |
| `POST /videos` | Register the uploaded asset and its metadata | Owning creator |
| `GET /videos` | The creator's library with offer relationships | Creator |
| `GET /videos/{id}` | One owned video | Owning creator |
| `DELETE /videos/{id}` | Delete a video no offer references | Owning creator |
| `GET /offers` | Brand discovery listing | Public |

`POST /offers` gained an optional `video_id`. Supply either `video_id` or a
complete `content_url` with `content_sha256`, never both and never neither. With
`video_id` the server resolves the watermarked preview and fingerprint from the
video record, so the browser is never the authority for the media reference.

### How the frontend interacts

1. **My Videos** calls `GET /videos` with a signed request. It returns each
   video with its watermarked preview, an owner-only original, and the real
   offer rows attached. The frontend must not infer offer state from whether an
   id is present; `offers[]` is authoritative.
2. **Upload Video** calls `POST /videos/upload-authorization`, then uploads the
   file straight to Cloudinary from the browser. The application server never
   proxies the bytes.
3. **Register** posts the returned Cloudinary metadata to `POST /videos`. The
   server consumes the single-use upload session in the same transaction as the
   insert, so an asset can only be registered by the creator whose signed
   parameters produced it.
4. **Create Offer** posts `video_id` with the normal offer fields. The response
   carries the server-resolved `terms`; **sign that returned object**, not a
   local reconstruction, then `POST /offers/{id}/publish` as before.
5. **Browse Offers** calls `GET /offers`, which needs no credentials. Cards link
   to `GET /offers/{id}` for authoritative detail and the existing purchase
   flow.

`signHttpAuthorization` in `frontend/lib/nostr.ts` types `method` as
`"GET" | "POST"`. `DELETE /videos/{id}` needs that widened to include `DELETE`.

### Storage

Videos are stored as a JSONB document plus two indexed columns, matching how
offers are stored. `videos.owner_public_key` is denormalised from the document so
ownership is enforced by the query, and `offers.video_id` mirrors
`document->>'video_id'` so discovery can join without scanning the offers jsonb.
`offers.video_id` is a foreign key, which is a database-level backstop behind the
service check that refuses to delete a referenced video.

A video carries only media processing state (`processing`, `ready`, `failed`).
Offer, payment and license states are never mirrored onto it, and an offer cannot
be created until the video is `ready`. One video may back more than one offer.

### Media exposure

Delivery URLs are built only in `src/services/media/cloudinary.js`, so
transformation strings never appear in frontend components. The watermarked
preview and thumbnail are public; the unrestricted original is returned only to
the authenticated owner and never through discovery.

### Fingerprints

Two values are stored and they are not interchangeable.
`reference_sha256` is derived by the server from the Cloudinary asset reference
and version, is authoritative, and is what goes into `terms.content_sha256`
signed into the offer event. `original_sha256` is creator-reported: the browser
uploads straight to Cloudinary, so the server never sees the bytes and cannot
verify it. Nothing yet re-hashes a video to compare against either value.

### Configuration

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are
optional; `CLOUDINARY_FOLDER` defaults to `contentport/videos`. When any part is
missing the content endpoints return `501` and the licensing engine keeps
working, the same way an unconfigured Polar LND wallet does. The API secret is
never returned to a client and only ever used to sign.

### Deliberate omissions

Prices are exposed in satoshis only. The backend does not convert to KES,
because `docs/data-model.md` states there is no implicit KES conversion, so the
brand feed must drop its `≈ KES` label or compute it client-side. Discovery
returns `creator_public_key` rather than a display name because the repository
has no Nostr profile resolution. Archiving a video that still has offers is an
open product decision.

## Next implementation decisions

- Select wallet integration and demonstrate invoice creation and verified settlement into the creator wallet.
- Add buyer identity and brand acceptance checks; creator request authentication is implemented.
- Select experimental event kinds after a registry collision check and validate relay support.
- Add payment reconciliation to the existing offer transactions and publication outbox.
- Integrate frontend signing and validate the implementation against a development relay.
- Build the creator upload UI and connect `My Videos`, `Browse Offers` and `View Offer` to the content endpoints.
- Decide whether a Nostr profile resolver is needed for creator display names.
- Decide what happens to a video whose offers still reference it.

Day 1 assumes one intended brand and one license per offer, prices in satoshis, and a ContentPort key that attests to settlement. These are explicit MVP decisions, not claims of completed functionality.

## Extended Day 1 schemas

See the [media, order, Lightning receipt and download schemas](docs/extended-data-model.md) for the new definitions, validation rules, and remaining persistence/API work.
