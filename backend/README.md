# ContentPort backend

For a local database without Supabase, follow [PostgreSQL with Docker Compose](docs/local-database.md).

Day 1 defines the data and protocol contracts. Day 2 adds offer creation, PostgreSQL persistence, signed request authentication, and queued Nostr publication. See the [Day 2 setup guide](docs/day-2.md).

## Run the Day 1 checks

Requires Node.js 22 or newer and npm.

```bash
cd backend
npm install
npm test
npm run contracts
```

The offer API and publication worker are implemented. Dependency installation and live PostgreSQL/relay checks remain pending; see the Day 2 guide for the exact setup requirements. Payment and license settlement integrations are not implemented.

## Start here

| Deliverable | Documentation | Code |
| :--- | :--- | :--- |
| Data structures | [Data model](docs/data-model.md) | [Shared schemas](src/models/schemas.js) |
| API contracts | [API guide](docs/api-contract.md), [OpenAPI JSON](docs/openapi.json) | [Contract source](src/contracts/contract.js) |
| Nostr event structure | [Event design](docs/nostr-events.md) | [Event builders](src/services/nostr/events.js) |

```text
backend/
├── docs/            # Day 1 decisions and generated OpenAPI contract
├── scripts/         # Contract export
├── src/
│   ├── models/      # Data schemas
│   ├── validators/  # Request and data validation
│   ├── contracts/   # API contract definitions
│   ├── controllers/ # Offer request handlers
│   ├── routes/      # Offer endpoint matching
│   ├── middleware/  # Signed HTTP authentication
│   ├── repositories/ # PostgreSQL offer persistence
│   ├── database/    # SQL migrations
│   ├── config/      # Environment configuration
│   ├── utils/       # Shared error types
│   └── services/
│       ├── offers/  # Offer creation and publication rules
│       └── nostr/   # Event builders and relay publisher
├── test/            # Validation and protocol contract tests
├── index.js         # Package exports, not a server entry point
└── package.json
```

The initial code uses JavaScript modules to match the existing repository and run directly on Node. TypeScript and Fastify remain proposed choices for the application implementation. JSON Schemas are shared between validation and API documentation to avoid maintaining two incompatible definitions.

Controllers handle offer requests, routes match their URLs, services enforce offer rules, and repositories persist data. `src/server.js` starts the HTTP server and publication worker.

## Next implementation decisions

- Select wallet integration and demonstrate invoice creation and verified settlement into the creator wallet.
- Add buyer identity and brand acceptance checks; creator request authentication is implemented.
- Select experimental event kinds after a registry collision check and validate relay support.
- Add payment reconciliation to the existing offer transactions and publication outbox.
- Integrate frontend signing and validate the implementation against a development relay.

Day 1 assumes one intended brand and one license per offer, prices in satoshis, and a ContentPort key that attests to settlement. These are explicit MVP decisions, not claims of completed functionality.

## Extended Day 1 schemas

See the [media, order, Lightning receipt and download schemas](docs/extended-data-model.md) for the new definitions, validation rules, and remaining persistence/API work.
