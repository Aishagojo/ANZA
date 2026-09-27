# ContentPort — Frontend

Next.js (App Router) + TypeScript + Tailwind implementation of the 5-screen
ContentPort MVP. This app currently runs entirely on a **mock API** stored in
the browser's localStorage, so the full creator → brand → payment → license
flow works end-to-end with no backend running.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Create an offer, open its public URL, click
"Purchase License," and the mock payment auto-confirms after ~4 seconds so
you can see the full flow, including the LICENSED state.

## Folder structure

```
app/
  page.tsx                     Screen 1 — Landing Page
  create/page.tsx              Screen 2 — Creator Offer Form
  offers/[offerId]/page.tsx    Screen 3 + 5 — Public Offer / Licensed (same route)
  offers/[offerId]/pay/page.tsx Screen 4 — Payment

components/
  layout/     Navbar, Footer (shared on every screen)
  ui/         Button, Card, StatusBadge, Input/Textarea/Select, CopyButton
  offer/      OfferForm, ContentPreview, LicenseDetails, VerificationCard
  payment/    LightningQR, InvoiceDisplay, PaymentStatus

lib/
  types.ts          Shared TypeScript types — mirrors the API contracts exactly
  licenseTypes.ts   License type labels/descriptions (30-Day Social, etc.)
  api.ts            ⭐ THE FILE THE BACKEND TEAM CARES ABOUT — see below
```

## For the backend team — how to plug in

**Everything goes through `lib/api.ts`.** No component anywhere calls
`fetch` directly. That file exports four functions, each already documented
with the exact real `fetch` call to use, copied from the four endpoints in
the spec:

| Function                 | Endpoint                              |
|---------------------------|----------------------------------------|
| `createOffer(payload)`     | `POST /api/offers`                     |
| `getOffer(offerId)`        | `GET /api/offers/:offerId`             |
| `createPaymentRequest(id)` | `POST /api/offers/:offerId/payment`    |
| `getOfferStatus(id)`       | `GET /api/offers/:offerId/status`      |

To switch a function from mock to real:

1. Set `NEXT_PUBLIC_USE_MOCK_API=false` in `.env.local`.
2. Set `NEXT_PUBLIC_API_BASE_URL` to your API's base URL.
3. Nothing else — the real `fetch` branch inside each function is already
   written, typed, and wired up. The mock branch simply stops being used.

If your response field names differ from the spec (e.g. you call it
`priceInSats` instead of `priceSats`), the two places to reconcile that are:
`lib/types.ts` (the type definitions) and the corresponding function in
`lib/api.ts` (map your response shape onto our types there). No screen or
component needs to change.

### Payment polling vs. push

`app/offers/[offerId]/pay/page.tsx` currently polls `getOfferStatus` every
3 seconds (configurable via `NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS`). If you'd
rather push confirmation over SSE or a WebSocket, only the polling
`useEffect` in that one file needs to change — swap the `setInterval` for a
subscription that calls the same `setConfirmed(true)` on a "LICENSED" event.

### Nostr event links

The "View Nostr Event" link on the Licensed screen currently points at
`https://njump.me/<eventId>` as a placeholder public explorer. Swap this for
whatever explorer/relay viewer you want linked in production
(`app/offers/[offerId]/page.tsx`, near the bottom of `LicensedView`).

### Content hosting

`components/offer/ContentPreview.tsx` guesses image vs. video from the file
extension in `contentUrl`, per spec section 22 (no upload infra, just a
Cloudinary-hosted URL). If the offer response ever includes an explicit
`contentType` field, that's the one line to change.

## What's intentionally NOT built

Per spec section 28: no auth, no dashboard, no creator profiles, no search,
no analytics, no M-Pesa, no file upload, no DRM/watermarking. If a screen
seems "missing" a feature, it's almost certainly listed as CUT in the spec —
check there before adding it.

## Design tokens

All colors/spacing live in `tailwind.config.ts`, copied 1:1 from the design
spec's color system. If the palette changes, that's the only file to edit.
