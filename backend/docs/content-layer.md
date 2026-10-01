# Content layer: creator videos and brand discovery

The content layer records content a creator owns and connects it to the existing
licensing engine. It does not implement offers, payments, licenses or Nostr
publication; those remain in [offers/service.js](../src/services/offers/service.js)
and are unchanged apart from accepting a video reference.

```text
Creator (Nostr key 27235 auth)
  -> videos.owner_public_key      (ownership decided by the database query)
  -> videos row (Cloudinary asset, watermarked preview)
  -> videoId
  -> existing Offer engine (Terms, offer event, Lightning invoice, license event)
```

## Endpoints

Base path `/api`. All video routes require the signed Nostr authorization
described in [day-2.md](day-2.md) and an `Idempotency-Key` on POST.

| Method and path | Purpose | Access |
| :--- | :--- | :--- |
| `POST /videos/upload-authorization` | Sign Cloudinary upload parameters for one direct upload | Creator |
| `POST /videos` | Register the uploaded asset and its metadata | Owning creator |
| `GET /videos` | The authenticated creator's library with offer relationships | Creator |
| `GET /videos/{id}` | One owned video | Owning creator |
| `DELETE /videos/{id}` | Delete a video no offer references | Owning creator |
| `GET /offers` | Brand discovery listing | Public |

`POST /offers` gained an optional `video_id`. Supply either `video_id` or a
complete `content_url` plus `content_sha256`, never both and never neither. With
`video_id` the server resolves the canonical watermarked preview and fingerprint
from the video record, so the browser is never the authority for the media
reference. The returned offer carries the resolved `terms`; the frontend must
sign that returned object rather than its own local copy.

## Upload flow

The browser uploads the binary directly to Cloudinary; the application server
never proxies the bytes.

1. `POST /videos/upload-authorization` issues a single-use upload session and the
   signature for the exact parameters the browser will send. The API secret is
   read from configuration and never returned.
2. The browser uploads to Cloudinary, which returns the asset metadata including
   the `context` field that was signed into the request.
3. `POST /videos` registers the asset. The session is consumed in the same
   transaction as the insert, so an asset can only be registered by the creator
   whose signed authorisation produced it, and a session cannot be replayed to
   register a second asset. The public id must sit under the configured
   ContentPort folder, so a crafted id cannot point at another tenant's media.

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are
optional. When any is missing the content endpoints return `501` and the
licensing engine keeps working, the same way an unconfigured Polar LND wallet
does. `CLOUDINARY_FOLDER` defaults to `contentport/videos`.

## Media exposure

Delivery URLs are built only in [media/cloudinary.js](../src/services/media/cloudinary.js)
so transformation strings never appear in frontend components.

| Reference | Audience |
| :--- | :--- |
| `original_url` | Owner only, from the authenticated creator's own library |
| `preview_url` | Watermarked (`l_text` overlay) and public |
| `thumbnail_url` | Public still frame |

`terms.content_url` on a video-backed offer is the watermarked preview, which is
what `data-model.md` requires of a public content reference. Discovery never
emits the unrestricted original, the owner's private metadata or any secret.

## Fingerprints

Two values are stored and they are not interchangeable.

- `reference_sha256` is derived by the server from the Cloudinary asset
  reference and asset version. It is authoritative and is what goes into
  `terms.content_sha256`, which is signed into the immutable offer event. A
  creator cannot choose it, and a re-upload under a new version changes it.
- `original_sha256` is the creator-reported fingerprint of the uploaded bytes.
  Because the browser uploads straight to Cloudinary, the server never sees the
  bytes and **cannot verify it**. It is retained as a claim, not as proof.

Nothing in the system currently re-hashes a video to compare against either
value. Both are recorded claims; only `reference_sha256` is server-authoritative.

## State ownership

A video carries only media processing state: `processing`, `ready` or `failed`.
An offer cannot be created until the video is `ready`. Offer, payment and license
states are never mirrored onto a video. The creator library returns the real
offer rows for each video so the frontend does not infer offer state from
whether an id happens to be present.

One video may back more than one offer. Nothing prevents a creator from creating
a second offer for the same video, because different brands and different terms
are legitimate separate offers. The library response gives the frontend what it
needs to decide how to present that; the backend does not impose a one-offer
rule that the existing licensing rules do not have.

## Discovery eligibility

`GET /offers` lists offers the licensing engine has already published
(`published`) or that are awaiting license publication (`licensing`). Drafts are
private, and an already `licensed` offer is no longer purchasable, so it is not
listed. Results are capped at 50 and ordered newest first. A brand clicks a card,
then `GET /offers/{id}` remains the authoritative detail source; cards are
projections, not a substitute for it.

## Known limitations

- Price is exposed in satoshis only. The backend does not convert to KES.
  `data-model.md` states there is no implicit KES conversion, so the brand feed
  must drop its `≈ KES` label or compute it client-side.
- `creator_public_key` is returned rather than a display name. The repository has
  no Nostr profile resolution, so the frontend should keep formatting the key the
  way `fromBackend` already does.
- Deleting a video that an offer references is refused with `409 VIDEO_IN_USE`,
  and the `offers.video_id` foreign key is a second backstop. Archiving a video
  while keeping its offers is a product decision that has not been made.
- Video processing is reported by the status the browser sends back from
  Cloudinary. A webhook from Cloudinary to the backend has not been built, so a
  video left in `processing` is corrected by re-registering it.
