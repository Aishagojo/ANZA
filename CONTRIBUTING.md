# Contributing to ContentPort

Thanks for looking at this. This document describes how the project actually works today, and where a convention is genuinely new it is marked **[new]** so you can tell the difference between "this is what we do" and "this is what we would like to do."

For what the software does and how it is built, see [`README.md`](README.md). This file covers only how to work on it.

## Table of contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Contribution Workflow](#contribution-workflow)
4. [Development Setup](#development-setup)
5. [Project Structure](#project-structure)
6. [Coding Standards](#coding-standards)
7. [Pull Request Process](#pull-request-process)
8. [Issue Reporting](#issue-reporting)
9. [Feature Requests](#feature-requests)
10. [Documentation](#documentation)
11. [Testing](#testing)
12. [Security](#security)
13. [Questions and Support](#questions-and-support)
14. [Git and Commit Practices](#git-and-commit-practices)
15. [Environment Safety](#environment-safety)
16. [Nostr Relay Safety](#nostr-relay-safety)
17. [Lightning Payment Safety](#lightning-payment-safety)
18. [Deployment Checklist](#deployment-checklist)
19. [Open Source Culture](#open-source-culture)

---

## Code of Conduct

There is no `CODE_OF_CONDUCT.md` in this repository yet. The expectations below are the project standard going forward.

We want this to be a place where people can disagree about architecture in public without it becoming personal.

**Expected**

- Assume good faith. Someone asking a basic question is learning, not wasting time.
- Criticise the change, not the person. "This will double-query on every poll" is useful; "this is careless" is not.
- Disagree technically, with reasons. If you cannot explain why your approach is better, yours is a preference, not a correction.
- Accept that maintainers may merge, close, or ask for a different approach. That is not a judgement of your worth.
- Be accessible. Plain language beats jargon. Not every reader is a Lightning expert.

**Not acceptable**

- Harassment, insults, or personal attacks, in issues, pull requests, or review comments.
- Sexualised language or imagery.
- Publishing someone's private information, or contacting a creator or brand outside a platform channel about their content.
- Sustained disruption, or arguing past a decision that has already been made.

Report a concern to the maintainers privately. Concerns are handled confidentially; the reporter is not expected to be involved in any resolution.

---

## Getting Started

**Prerequisites**

- Node.js 22 or newer
- Docker and Docker Compose
- A NIP-07 browser signer (nos2x, Alby, or Flamingo) — only needed to actually publish an offer through the UI

**Fork and clone**

```bash
git clone https://github.com/Aishagojo/Group1-H4H.git
cd Group1-H4H
git remote add upstream https://github.com/Aishagojo/Group1-H4H.git
```

**Install dependencies**

```bash
cd backend  && npm install
cd ../frontend && npm install
```

**Start the database**

```bash
docker compose up -d --wait postgres
```

Add `docker compose up -d --wait` instead to also start the local strfry relay on `ws://localhost:7777`, which you need for offer publication.

**Apply migrations**

```bash
cd backend && npm run migrate
```

**Configure environment**

Create `backend/.env` from the template in the README's [Configuration](README.md#configuration) section. There is **no `backend/.env.example` in the repository**, so the README table is currently the only reference.

```bash
cp frontend/.env.example frontend/.env
```

**Run**

```bash
cd backend  && npm start     # :3000
cd frontend && npm run dev   # :3001
```

**Run the checks**

```bash
cd backend  && npm test
cd ../frontend && npx tsc --noEmit
```

**Linting and formatting — read this**

There is no linter and no formatter configured in this repository. No ESLint config exists, so `npm run lint` in `frontend` drops into an interactive setup prompt and cannot run in CI or unattended. There is no Prettier config and no `.editorconfig`.

Until a linter is added, the de facto standard is **match the surrounding code**. The conventions in [Coding Standards](#coding-standards) describe what is already there.

---

## Development Setup

The short version is in [Getting Started](#getting-started). These are the details that are easy to get wrong.

**`frontend/.env` must match the backend exactly on two values**

| Variable | Must equal |
| --- | --- |
| `NEXT_PUBLIC_NOSTR_OFFER_KIND` | backend `NOSTR_OFFER_KIND` |
| `NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY` | backend `NOSTR_ATTESTOR_PUBKEY` |

If they disagree, offer publication is rejected with `INVALID_EVENT` — *"Event must match the creator, configured kind, draft terms, tags, attestor, and timestamp policy."* That single error covers several distinct causes, so check these values first.

**Restart the frontend after changing any `NEXT_PUBLIC_*` value**

Next.js inlines them at build time. A running dev server keeps serving the old value and you will debug a fix that is already correct.

**Do not run `npm run build` while `npm run dev` is running**

Both use `frontend/.next`. Running them concurrently corrupts the directory and produces `Cannot find module './vendor-chunks/...'`. If it happens: stop the dev server, delete `frontend/.next`, restart.

**`npm run build` requires network access**

`frontend/app/layout.tsx` fetches Inter through `next/font/google` at build time, so a build with no internet fails on font download. Use `npx tsc --noEmit` for an offline check.

**If port 5432 is taken**

Set `POSTGRES_HOST_PORT` in the repository-root `.env` and use the same port in `DATABASE_URL`. Do not stop an unrelated database to free the port.

---

## Project Structure

```
frontend/          Next.js 14 app — the only place React components live
backend/           Node.js API — the only place business rules and SQL live
compose.yaml       PostgreSQL + strfry, local development only
strfry.conf        Local relay configuration
```

Backend, by responsibility:

| Directory | Responsibility | Must not |
| --- | --- | --- |
| `src/routes/`, `src/controllers/` | URL matching, request/response handling | Contain business rules |
| `src/services/offers/` | Offer, payment, and licence workflow | Touch SQL directly |
| `src/services/nostr/` | Event builders, relay publisher, attestor signer | Make policy decisions |
| `src/services/payments/` | LND REST client | Decide when a payment is settled |
| `src/repositories/` | SQL and persistence | Contain business rules |
| `src/models/`, `src/validators/` | JSON Schemas and cross-field rules | Be defined twice |
| `src/middleware/` | Signed HTTP authentication | — |
| `src/contracts/` | OpenAPI contract source | Drift from `docs/openapi.json` |
| `src/database/migrations/` | SQL schema, applied in filename order | Be edited after release |

**Where new functionality usually goes**

| You are adding | Put it in |
| --- | --- |
| A screen or component | `frontend/app/` for routes, `frontend/components/` for reusable pieces |
| An API call to the backend | `frontend/lib/api.ts` |
| A new backend endpoint | `routes/` → `controllers/` → `services/` |
| A Nostr event or tag | `backend/src/services/nostr/events.js` |
| A validation rule | `backend/src/models/schemas.js` (shape) or `record-rules.js` (cross-field) |
| A database change | A new `00N_name.sql` migration — never edit an existing one |

**The Licensing Engine** is `backend/src/services/offers/`, plus the frontend pay and offer pages. It is the core of the system. It reaches the outside world only through constructor-injected dependencies — `store`, `verifyEvent`, `paymentProvider`, `signEvent`, `publish`. Keep it that way: business rules must remain testable without a database, a relay, or a Lightning node.

**Respect the boundary between content and licensing.** The Licensing Engine needs a content *reference* and a fingerprint. It does not need to know about storage, transcoding, or watermarking, and those concerns do not belong inside it. Media does not belong on Nostr just because the licensing record does.

---

## Coding Standards

These describe what the codebase already does.

### Backend (JavaScript, ESM)

- ES modules only. `import`/`export`, no `require`.
- No build step and no transpiler. The backend is plain JavaScript that runs directly on Node.
- Two-space indent, semicolons, **single quotes** in `src/`.
- Concise object literals are written inline (`{ status: 200, body: {...} }`); the codebase is denser than a typical style guide suggests. Match the file you are in.
- Comments explain **why**, not what. A comment earns its place when the code looks wrong but is deliberately right — for example, why a `jsonb_set` is used instead of a whole-document write. Do not narrate self-evident code.
- Every external dependency is injected, never imported at module scope in a service.

### Frontend (TypeScript)

- `strict: true` is on. Do not weaken it or add `any` to make a check pass.
- `"use client"` at the top of any file using hooks or browser APIs.
- Components are arrow functions with **named exports**, one component per file, filename in `PascalCase` matching the component (`PaymentStatus.tsx`).
- Double quotes and semicolons, matching the existing `.tsx` files.
- Styling is Tailwind classes only. Colours come from the tokens in `tailwind.config.ts` (`text-primary`, `brand`, `success`, `surface`, `bitcoin`, `border`). **Do not add raw hex values in components.**
- Types live in `frontend/lib/types.ts`. Use the `@/*` path alias rather than deep relative imports.
- No state management library. Local `useState` and `useRef` are the whole pattern.

### API and HTTP

- JSON in, JSON out, under `/api`.
- Errors are `HttpError(status, code, message)` from `src/utils/errors.js`, rendered as `{ "error": { "code", "message" } }`. Never leak a stack trace or an internal message to the client — `app.js` already returns a generic `DEPENDENCY_UNAVAILABLE` for unrecognised errors; keep it that way.
- `POST` routes that can be retried require an `Idempotency-Key` (16–128 characters of `[A-Za-z0-9_-]`). Authenticated writes must be idempotent, and the response is replayed for a repeated key.
- Every authenticated request carries a kind `27235` (NIP-98) signed `Authorization: Nostr <base64-event>`. The event must have empty content, be within 60 seconds of now, and bind the caller's pubkey to the `u` (URL), `method`, a SHA-256 hash of the raw body, and the `contentport-idempotency-key` tag. Do not add an unauthenticated write path for state that later becomes security-relevant.
- Request bodies are capped at 64 KiB.

### Validation

- Shape validation lives in the shared JSON Schemas, validated with `ajv` in `strict` mode.
- Cross-field invariants live in `backend/src/validators/record-rules.js`.
- The same Schemas generate the OpenAPI contract. **There is no second definition of a request shape.**
- `additionalProperties: false` is deliberate — it is what rejects attempts to inject a field such as `private_key`.
- Reject rather than coerce. The code favours throwing over silently defaulting.

### Database

- Migrations are plain SQL in `src/database/migrations/`, applied in filename order and recorded in `schema_migrations`. Each runs in its own transaction.
- **Never edit a migration that has already been released.** Add a new one. `migrate.js` skips applied files, so an edit is silently ignored on any existing database.
- Use targeted updates (`jsonb_set` on a single key) rather than whole-document writes wherever a concurrent worker may touch the same row. The publication worker and the payment poller do.
- Enforce invariants in the schema where possible: unique constraints, foreign keys, `CHECK` constraints.
- Prefer `ON CONFLICT` for idempotent writes.

### Nostr events

- Event builders are **pure functions** in `services/nostr/events.js`. They take a template and return a template. They must never sign, never perform network calls, and never accept a private key.
- Signing happens in `signer.js` (`createAttestorSigner`). Creator signing happens in the browser.
- Two configured kinds, no defaults: `NOSTR_OFFER_KIND` and `NOSTR_LICENSE_KIND`, each an integer in `1000–9999`. Validators reject anything outside that range, including the replaceable range (kind `30078` and similar).
- Content is a JSON string carrying a `schema` field, currently `contentport.offer.v1` or `contentport.license.v1`. Tags use the `t` namespace plus `e` and `p` references.
- Builders re-verify their inputs against the offer on record — event ID, amount, attestor, settlement ordering — and throw rather than emit something inconsistent.
- **Adding a new event kind is a protocol decision, not a refactor.** Open an issue and get agreement first.

### Lightning and payments

- All Lightning access goes through `services/payments/lnd-client.js`. It is the only module that talks to LND.
- Never mark a payment settled from anything the client says. Settlement is confirmed by querying the wallet, and the response must echo a matching `r_hash`.
- Invoice amount and destination come from stored terms, never from the request body.
- Payment settled and licence published are **separate states**. Do not collapse them, and do not report a completed purchase when only payment has been confirmed.
- See [Lightning Payment Safety](#lightning-payment-safety) before touching anything payment-related.

### If you change the API contract

`src/contracts/contract.js` is the source; `docs/openapi.json` is generated. A test asserts the file matches the source, so:

```bash
cd backend && npm run contracts && npm test
```

Skipping the export step fails `contracts.test.js`.

---

## Pull Request Process

There are no pull request templates in the repository yet. This is the standard we ask for.

**Scope**

- One concern per pull request. A feature, a fix, and a refactor of an unrelated module belong in separate PRs.
- If a refactor is genuinely required to land the feature safely, say so explicitly in the description and keep it in one commit.
- Do not reformat files you are not otherwise changing. It buries the real diff.

**Description should cover**

- What changed and why.
- Which issue it closes, if any. Write `Closes #12`, not just a bare number.
- How you verified it — the exact commands you ran and what you saw.
- Any change to environment variables, migrations, event kinds, or API responses.
- Any change to what is published publicly to Nostr, called out explicitly.
- Anything a reviewer cannot see from the diff, especially reasoning about a deliberate trade-off.

**UI changes** need before/after screenshots. Note any change to the mobile layout.

**Breaking changes** need their own callout. In this project that means: a change to `NOSTR_OFFER_KIND` or `NOSTR_LICENSE_KIND`; a change to the `contentport.offer.v1` or `contentport.license.v1` schemas; a change to signed authentication; or a migration that alters or drops data.

> **Already-published offers are signed records.** Changing a published event schema or kind means old events become unverifiable under the new rules. That is a migration decision, not a code cleanup. Raise it in an issue before writing code.

**Review**

Expect discussion rather than rubber-stamping. Address feedback with new commits rather than force-pushing, so reviewers can see what changed.

**Before opening**

```bash
cd backend  && npm test
cd ../frontend && npx tsc --noEmit
```

Both must pass. If your change touches `src/contracts/`, also run `npm run contracts`.

---

## Issue Reporting

There is no issue template in the repository. A good report makes the problem reproducible.

**Before opening**, search existing issues — several problems here have already been identified, including the CORS restriction, the non-functional webhook path, and the missing `LICENSE` file.

**A good bug report contains**

- **Title**: what broke, and where. "License event not published after settlement on test-solutions", not "broken".
- **Description**: what you expected to happen, and what happened instead.
- **Reproduction steps**: numbered, from a clean state, so someone else can follow them exactly.
- **Environment**: Node version, operating system, branch and commit, and the relevant `.env` keys **with secrets removed**. Say which relay configuration and whether Polar was running.
- **Evidence**: screenshots for UI problems, and the backend console output. The publication worker logs relay errors, and those messages are usually diagnostic.
- **Impact**: who is blocked, and what they cannot do. A payment or licensing problem is higher severity than a cosmetic one.
- **Severity**: blocking / serious / minor / cosmetic, and why.

**If it involves Nostr**, include the event kind and, if the event exists, its ID. If it involves Lightning, include whether the invoice settled at the node and what the wallet reported. Never paste a BOLT11 invoice, a macaroon, or a preimage into an issue.

---

## Feature Requests

Open an issue **before** implementing anything substantial. This is not bureaucracy — several features here are separated by real architectural decisions that are expensive to reverse.

Describe:

- **The problem**, not the solution first. Who has it, and what are they doing instead today?
- **Proposed solution**, and the alternatives you considered, including doing nothing.
- **User impact** — which of the two product flows it serves.
- **Technical considerations.**
- **Impact on the Licensing Engine.** Does it change offer state, payment handling, or licence issuance? This is the core of the system; changes here are the most expensive to revisit.
- **Impact on Nostr.** Does it add or change an event kind, a tag, or a content schema? Does it change what becomes permanently public?
- **Impact on Lightning.** Does it change invoice creation, settlement detection, or who gets paid?
- **New storage or security requirements.** Does it introduce user media, private assets, tokens, or new credentials?
- **Explicitly state whether it belongs to the two in-progress flows** — creator upload, or brand discovery.

Architecture is currently a modular monolith with injected dependencies, not microservices. A feature that pushes toward independently deployable services is worth discussing, but it should be a conscious decision rather than a side effect.

---

## Documentation

Keep the two documents separate and do not duplicate one in the other:

| File | Contains |
| --- | --- |
| `README.md` | What the project is, architecture, setup, current capabilities, usage, environment variables, environments and deployment |
| `CONTRIBUTING.md` | This file — workflow, conventions, testing, security |
| `backend/docs/` | Design decisions: data model, Nostr event design, API contract, database setup |
| `backend/README.md`, `frontend/Readme.front.md` | Brief per-package pointers |

**Update the README when you change:**

- a capability, in either direction — including removing one
- an environment variable, or its requirement
- a script, or a setup step
- the division between what is implemented and what is planned
- the project structure, if you add or move a top-level area

**Update `backend/docs/` when you change:**

- a JSON Schema or the data model → `data-model.md`
- a Nostr kind, tag, or content schema → `nostr-events.md`
- an endpoint or the OpenAPI source → `api-contract.md`, then run `npm run contracts`

**Be precise about status.** Distinguish implemented, partially implemented, schema-only, work in progress, and planned. A JSON Schema with a passing test but no table, endpoint, or UI is **schema-only**, and saying otherwise overstates the project. The README's *Known gaps* section exists because the documentation drifted from the code; keeping it accurate is a contribution in itself.

---

## Testing

**Commands**

```bash
cd backend && npm test          # 41 tests, 40 passing, 1 skipped
cd ../frontend && npx tsc --noEmit
```

**What exists today**

| Area | Status |
| --- | --- |
| Backend unit and integration tests | 41 tests across 5 files in `backend/test/` |
| Real signature verification | Yes — tests sign with `finalizeEvent` and verify with `verifyEvent` |
| LND client | Tested against the real client with an injected transport |
| PostgreSQL transactions | **Skipped by default** — needs `TEST_DATABASE_URL` |
| Frontend | **No tests at all** |
| CI | **None** — there is no `.github` directory |
| Linting | **None configured** |

Run the PostgreSQL test before any change that touches persistence:

```bash
TEST_DATABASE_URL=postgresql://contentport:change-me@localhost:5433/contentport npm test
```

It creates and drops its own schema. Use a scratch database, never a database holding real offers.

**Which changes need tests**

Changes to licensing, payment, Nostr events, API behaviour, or authentication should come with tests. Concretely:

- **Licensing or offers** — cover the new rule and its rejection case. The existing tests pair each accept with a refuse; follow that.
- **Payment** — cover the failure path as well as the success path. A settlement that disagrees with the offer must be refused, and that refusal needs a test.
- **Nostr events** — test the builder as a pure function. Assert tags, content, and that a mismatch throws.
- **Authentication** — assert what is rejected, not just what is accepted.
- **Storage or video** — no infrastructure exists yet. Add the schema and its validation rules, and label them schema-only.
- **Frontend** — there is no runner, so at minimum run `npx tsc --noEmit` and describe in the PR how you verified the behaviour. Adding a test runner is a welcome contribution.

**Never write a test that touches a real wallet, a real relay, or real funds.** Tests use injected transports and local fixtures. A test that can move money is a defect.

**The PostgreSQL integration test is the one most often skipped**, which is exactly when persistence bugs appear. If you touch `repositories/` or a migration, run it.

---

## Security

There is no `SECURITY.md` in this repository. These are the rules that already apply, and they are not optional.

**Never commit**

- `.env` files, or any real credential
- Nostr private keys — `nsec`, `ncryptsec`, or raw hex
- LND macaroons, including hex-encoded
- Provider API keys, client secrets, webhook secrets
- Database passwords, tokens, or tunnel URLs
- Generated local binaries, `.next`, or database dumps

All of these are gitignored today. If you add a new secret type, add the ignore rule in the same commit.

**Check that new files are actually tracked.** `backend/.gitignore` ignores `*.sql` under a "local data" rule and then carves migrations back out with `!src/database/migrations/*.sql`. That carve-out exists because the blanket rule once caused `002_licenses.sql` to be silently untracked — invisible in everyone else's checkout, and absent from a fresh deploy. The rule is correct today, but it shows how easily a legitimate source file gets swallowed here. Run `git status` and confirm a new migration appears as tracked before you open the pull request.

**Creator private keys must never reach the server.** Offers are signed by the NIP-07 extension in the browser. Do not add a code path that accepts a key, seed, or `nsec` in a request body. The Terms schema sets `additionalProperties: false` specifically to reject this.

**Signing credentials are the highest-value secret here.** The attestor key signs licence events that assert a payment settled. If it is compromised, an attacker can publish false licences. `readConfig` already refuses to start if `NOSTR_ATTESTOR_SECRET` does not derive to `NOSTR_ATTESTOR_PUBKEY`; keep that check.

**Do not expose production payment infrastructure in development.** See [Environment Safety](#environment-safety).

**Do not expose private creator content.** Content URLs in an offer are public by design. Originals, storage keys, and download tokens belong in private records only. The download-grant schemas already model this: store a token *hash*, never the token, and keep `original_object_key` opaque.

**Buyer identity is private.** Buyer acceptance, wallet credentials, invoices, and payment preimages must never enter a public offer or a Nostr event.

**Reporting a vulnerability**

Open an issue describing the problem **without** exploit details, working credentials, or the personal data involved, and ask for a private channel. Do not open a public issue containing a working proof of concept against production infrastructure, and do not test against infrastructure you do not own.

If a secret is ever committed, treat it as compromised: rotate it immediately. Removing it in a later commit does not un-leak it, because it remains in history.

---

## Questions and Support

- **Read the code and the docs first.** `backend/docs/` records most design decisions and the reasoning behind them, including decisions that look odd but are deliberate.
- **Check the README's *Known gaps* section.** Several things that look broken are already identified, including the CORS restriction and the non-functional webhook path.
- **Open an issue** for anything unclear, or ask in the project's discussions channel.
- **Do not open a pull request to ask a question.** That spends review capacity on something a comment would answer.

If you are new to Lightning, the LND and Polar concepts are the hardest part. The Lightning implementation in this repository is deliberately thin, and `backend/docs/nostr-events.md` explains the trust model in plain terms. Ask about the trust model before changing what the system asserts — that is where the risk is.

---

## Git and Commit Practices

**What the repository actually does**

`main` has 55 commits. 45 of them have no conventional prefix; 6 use `feat:`, 2 `chore:`, 2 `merge:`, and the rest are GitHub merge commits. On `test-solutions` it is 16 of 62. **Conventional commits are emerging, not established** — about 18% of history, and only `feat`, `chore`, and `merge` have ever been used.

Branch names are also mixed: `nady-front` and `add-footer` are personal or plain, while `integration/frontend-backend` and `feat/lightning-payment-settlement` use a prefix. There is no enforced convention.

So this is a **recommendation** **[new]**, not a rule the team has been following:

### Commits

Use Conventional Commits:

```
feat: add signed licence event on settlement
fix: reject webhook signatures that do not match the body hash
docs: document the staging isolation requirements
test: cover outbox retry with a failing relay
refactor: extract licence issuance from the status handler
chore: ignore TypeScript incremental build artifacts
```

Write the subject in the imperative, under about 72 characters, with no trailing period. Explain **why** in the body when the reason is not obvious from the diff — especially for changes to signing, payment, or published event formats.

Only `feat`, `chore`, and `merge` have precedent here. The other prefixes below are new usage, so introduce them deliberately rather than assuming they are established.

### Branches

Branch from an up-to-date `main`:

```bash
git checkout main
git pull
git checkout -b feat/brand-discovery-feed
```

Use a prefix describing the kind of change:

| Prefix | Use for |
| --- | --- |
| `feat/` | New functionality |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `test/` | Tests only |
| `refactor/` | Behaviour-preserving restructuring |
| `chore/` | Build, config, dependencies, housekeeping |

Two existing branches already follow this, so it fits the repository rather than fighting it. Avoid naming branches after yourself — it makes ownership harder to follow and breaks down when more than one person works on a branch.

### Pull requests

Merge pull requests rather than pushing to `main`. Squash or rebase before merging so the branch history stays readable, and write the final commit message at that point.

---

## Environment Safety

ContentPort touches Lightning payments, public Nostr relays, creator content, and signing credentials. Environment mistakes here are not always recoverable — a published Nostr event is permanent, and a Lightning payment is irreversible.

**Staging does not currently exist in this repository.** What follows describes what is true today and what contributors must do in the meantime.

### Development

Use development infrastructure only:

- Local PostgreSQL in Docker Compose
- Local strfry relay at `ws://localhost:7777`
- Polar regtest Lightning with two LND nodes, if you need payment
- Local `.env` files, gitignored

**Do not use production credentials locally, for any reason.** The most common way this goes wrong is copying a working `.env` from a shared machine. Generate throwaway keys instead:

```bash
cd backend
node -e "const {generateSecretKey,getPublicKey}=require('nostr-tools');const sk=Buffer.from(generateSecretKey()).toString('hex');console.log('NOSTR_ATTESTOR_SECRET='+sk);console.log('NOSTR_ATTESTOR_PUBKEY='+getPublicKey(Buffer.from(sk,'hex')));"
```

### Staging

If and when a staging deployment exists, it must be isolated from production in **every** dimension:

| Separation | Requirement |
| --- | --- |
| Application | A separate deployment from production |
| Database | A separate database and separate credentials |
| Secrets | A separate secret store; no overlap with production |
| Nostr relays | A dedicated staging relay set |
| Lightning | An isolated test or sandbox environment |
| Storage and video | A separate bucket; test assets must not reach production |

Changes touching Lightning, Nostr events, authentication, content access, video storage, or licensing should be exercised in staging before production.

The sharpest risk is Nostr: **an event published to a production relay is public, indexed, and effectively permanent.** It cannot be recalled. Staging therefore needs its own relay, and ideally its own event kinds so the two sets cannot be confused.

### Production

Production holds real users, real creator content, permanent Nostr events, and real Lightning payments. Contributors must never:

- commit production secrets
- use production Lightning credentials locally or in staging
- publish test events to production relays
- test payment flows with real funds
- expose private creator content
- copy production credentials into a committed `.env`

---

## Nostr Relay Safety

Relays are configured with a single variable, `NOSTR_RELAYS`, a comma-separated list that must not be empty. Startup validation requires **every** relay to use `wss://`, with one exception: `ws://` is permitted when the hostname is `localhost`, `127.0.0.1`, or `[::1]`. A relay URL carrying credentials or a `#` fragment is also rejected. So a purely local `ws://localhost:7777` list is valid, and a production list containing a `ws://` entry fails fast rather than publishing in cleartext — do not weaken that check without a replacement control.

Identifying the right configuration:

| Environment | `NOSTR_RELAYS` should be |
| --- | --- |
| Development | `ws://localhost:7777` (the strfry service in `compose.yaml`) |
| Staging | A dedicated staging relay set, not the production one |
| Production | `wss://` relays only |

Event kinds are also environment-scoped. Both `NOSTR_OFFER_KIND` and `NOSTR_LICENSE_KIND` must be chosen explicitly — there is no default, because a default would collide with other users of that range. The development values `9998` and `9999` are placeholders, not registered ContentPort kinds.

Before publishing anything, check the relay list and both kind values. The local strfry relay retains nothing and accepts everything, so a mistake there costs nothing. A mistake against a production relay is permanent and public.

**If you are unsure whether a relay is a test relay, treat it as production.**

---

## Lightning Payment Safety

**Polar is a development and test harness, not production infrastructure.** It runs a private Bitcoin *regtest* network. There is no Polar Docker image — it is a desktop application that uses Docker to spawn node containers, and it is not a `compose.yaml` service.

Regtest sats have no value. An `lnbcrt...` invoice exists only inside that network and cannot be paid by a normal wallet or a public testnet wallet. **A successful regtest payment is a test result and must never be presented as revenue.**

To exercise payments locally you need two LND nodes in the same Polar network: a **Creator** node the backend talks to, and a **Buyer** node that funds and pays. The invoice is paid from Buyer — a single node cannot pay its own invoice.

**No production payment provider is integrated.** The repository's LND client talks directly to a node over HTTPS using an admin macaroon, and `readLndUrl` requires an HTTPS **localhost** origin — a safeguard that currently prevents pointing it at a remote or production endpoint. Do not relax it as a shortcut.

`BITNOB_*` keys appear in some developers' local `backend/.env`, but **no source file reads them**. They are untracked exploration, not configuration. If you build a provider integration, add it as a real module with tests, not by wiring loose environment variables.

Rules for any payment work:

- Never test with real funds. Use regtest or a provider sandbox.
- Never commit a macaroon, in any encoding.
- Settlement must come from querying the wallet, never from a client assertion.
- The macaroon in `LND_MACAROON` is a **Creator** node admin credential. Treat it accordingly.

---

## Deployment Checklist

> **These are not automated gates.** There is no CI in this repository, no deployment pipeline, and no production deployment. This checklist is what a human should run manually before an environment is connected to real infrastructure.

**Before staging**

- [ ] `cd backend && npm test` passes
- [ ] `cd ../frontend && npx tsc --noEmit` passes
- [ ] `npm run build` succeeds (requires network)
- [ ] PostgreSQL integration test run with `TEST_DATABASE_URL`
- [ ] Environment variables reviewed for the staging environment
- [ ] Staging database selected — confirm the connection string
- [ ] Staging Nostr relay set selected — confirm `NOSTR_RELAYS` and both kind values
- [ ] Staging Lightning configuration selected, and confirmed to be a test environment
- [ ] `NOSTR_ATTESTOR_SECRET` is a throwaway key, not the production attestor
- [ ] No production secrets present in the environment

**Before production**

- [ ] Production secrets in a secret manager, not in an image or repository
- [ ] Production database selected, with backups and access control configured
- [ ] Production `NOSTR_RELAYS` verified as `wss://`, and the full set reviewed
- [ ] Production event kinds chosen after a kind-registry collision check
- [ ] Production Lightning configuration verified; custodial vs non-custodial decided and documented
- [ ] Payment settlement tested end to end on a real test environment before enabling real payments
- [ ] All migrations reviewed and applied; no migration edited after release
- [ ] Private content access reviewed — originals, storage keys, download tokens stay private
- [ ] CORS configured for the real frontend origin (**currently hard-coded to `http://localhost`**)
- [ ] Monitoring and logging in place (**none exists today**)
- [ ] An open-source licence selected and a `LICENSE` file added (**none exists today**)

The last two, plus CORS, are known blockers. They are listed in the README's *Known gaps* section.

---

## Open Source Culture

A few things that will make this repository genuinely easier to contribute to:

**Work through issues.** For anything beyond a small fix, agree on the approach before writing code. This project has already had design decisions made in code and documented after the fact, and the documentation drifted — the API contract describes payment endpoints that do not exist, and `backend/README.md` still says settlement is unimplemented. An issue first prevents that.

**Keep pull requests focused.** A reviewer who can hold one change in their head will give it a much better review than one buried in a mixed diff.

**Document decisions, not just code.** The `backend/docs/` files exist because the reasoning behind this system is genuinely non-obvious — why kinds are not defaulted, why NIP-78 was rejected, why the webhook path is unfinished. If you make a decision that a future contributor would find surprising, write down why.

**Write tests.** 41 backend tests with real signature verification is a genuine asset. The frontend has none, and the PostgreSQL test is skipped by default; both are the highest-value places to add coverage.

**Improve the documentation.** The README's *Known gaps* section is a live list of things that are wrong or missing. Removing an entry is as valuable as fixing the underlying issue.

**Discuss big changes early.** Adding an event kind, changing a published schema, introducing storage, or adding a payment provider all have consequences that are expensive to reverse. Raise them in an issue first.

**Respect the existing boundaries.** The Licensing Engine reaches the world only through injected dependencies. Keeping that property is what makes the business rules testable, and it is what would make extracting a service later possible. A change that reaches into the database from a service, or couples the engine to media storage, makes the next architectural change much harder.
