# Deploy ContentPort on Render

Create two **Web Services** and a **Postgres** database. The frontend runs Next.js with `next start`; it is not configured for static export.

Push the deployment changes to your GitHub repository before creating services. Select the branch containing those changes in Render. Never commit `.env` files.

## 1. Database

Choose **New Postgres**, name it `contentport-db`, and choose the same region as the backend. Copy its **Internal Database URL** into the backend's `DATABASE_URL` environment variable.

## 2. Backend

Choose **New Web Service**, connect `Aishagojo/Group1-H4H`, and use:

| Field | Value |
| --- | --- |
| Name | `contentport-backend` (or an available name) |
| Language | Node |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `node scripts/migrate.js && node src/server.js` |

The start command applies the existing repeatable migrations before starting the server and uses Render environment variables directly. It does not require a local `.env` file. Start with a single backend instance.

Set these environment variables:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22.22.2` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | Internal Database URL from Postgres |
| `PUBLIC_ORIGIN` | Actual backend HTTPS URL, without trailing slash or `/api` |
| `CORS_ORIGIN` | Actual frontend HTTPS URL, without trailing slash |
| `NOSTR_OFFER_KIND` | Your chosen kind, e.g. `9998`; match frontend |
| `NOSTR_ATTESTOR_PUBKEY` | Your attestor public key; match frontend (raw hex recommended) |
| `NOSTR_RELAYS` | Comma-separated reachable `wss://` relay URLs |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Your Cloudinary secret (backend only) |

Cloudinary credentials are needed for video uploads. For backend license signing, also set `NOSTR_ATTESTOR_PRIVATE_KEY` and, if it is encrypted, `NOSTR_ATTESTOR_PASSWORD`. Store them only in the backend's Render environment settings.

Use Render's assigned URLs, which may differ from the service names above. Update `PUBLIC_ORIGIN` after Render assigns the backend URL; it is used to verify signed browser requests. Update `CORS_ORIGIN` after creating the frontend. Leave the HTTP health check path unset: the API has no dedicated health endpoint.

## 3. Frontend

Choose another **New Web Service**, using the same repository and branch:

| Field | Value |
| --- | --- |
| Name | `contentport-frontend` (or an available name) |
| Language | Node |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start -- --hostname 0.0.0.0 --port $PORT` |

Set these before building:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22.22.2` |
| `NEXT_PUBLIC_API_BASE_URL` | Actual backend HTTPS URL followed by `/api` |
| `NEXT_PUBLIC_NOSTR_OFFER_KIND` | Same as backend, e.g. `9998` |
| `NEXT_PUBLIC_NOSTR_ATTESTOR_PUBKEY` | Same attestor public key as backend, in raw hex |
| `NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS` | `3000` |

`NEXT_PUBLIC_*` values are public and embedded during the build. Rebuild the frontend after changing them. After Render assigns the frontend URL, set that exact origin in backend `CORS_ORIGIN` and redeploy the backend.

## Payment limitation and verification

The current Lightning provider only accepts HTTPS localhost Polar LND URLs. Render cannot reach Polar running on your laptop through localhost. Leave `LND_MACAROON` unset for this deployment; invoice creation will be unavailable. Working hosted payments require a separate provider change with authenticated HTTPS and certificate verification. Do not expose the current local TLS-bypass client publicly.

Check backend deploy logs for successful migrations and `ContentPort API listening`. Request `https://<actual-backend-host>/api/offers` and confirm it returns successfully. Open the frontend, verify discovery loads, and try a signed creator upload with your Nostr browser signer. Confirm the frontend request receives an `Access-Control-Allow-Origin` header matching the frontend URL.

References: [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app), [web services](https://render.com/docs/web-services), [monorepos](https://render.com/docs/monorepo-support).
