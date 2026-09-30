# Extended Day 1 data schemas

These definitions extend the original creator, offer, terms, payment, and license models. Creators receive Bitcoin directly into their Lightning wallets. There are no M-Pesa, phone number, currency conversion, or platform payout fields.

## Records

| Schema | Fields and purpose | Visibility |
| :--- | :--- | :--- |
| MediaListing | Existing offer plus required title, description, and preview_image_url. terms.content_url references a public watermarked preview; terms.content_sha256 identifies those preview bytes. | Public |
| MediaAsset | Offer and creator references, opaque original_object_key, original_sha256, MIME type, size, creation time. The original checksum identifies the high-resolution asset separately from the preview. | Private |
| AcceptanceRecord | Buyer and offer IDs, exact offer event ID, affirmative acceptance, licensee name, server acceptance timestamp. | Private |
| Order | Buyer, offer/event, acceptance, payment and license references; pending, paid, expired, or failed state. | Private |
| DownloadGrant | Buyer, license and asset references, token hash, issue/expiry time, consumption or revocation time. | Private |

Creator continues to store a hexadecimal Nostr public key and a Lightning wallet connection reference. A display npub can be derived from that key. Wallet secrets and creator private keys do not belong in these schemas.

## Validation and private data

Shared JSON Schemas reject missing/unknown fields and invalid types. Additional JavaScript checks enforce consistent publication state, URLs without credentials, paid-order references and download timestamps. A URL field does not prove that a preview is watermarked or that its content is safe; media processing must enforce that later.

Original storage keys are opaque server-generated identifiers, not private URLs. Only a future authorized download service may resolve them to an object in private storage. Do not place them, wallet details, buyer information, or tokens in public offers or Nostr events.

Store only a SHA-256 hash of a cryptographically random download token. A future download service must check the buyer, settled payment, matching license and asset, expiry and revocation, then atomically consume the token to prevent concurrent reuse. The schema describes this state; it does not implement token issuance or enforce one-time use in a database. Consumed and revoked are mutually exclusive terminal states.

## Relationships and persistence still to implement

Foreign keys must connect each order to its buyer, acceptance and exact offer; the payment/license must reference that same offer. Link download grants to that buyer's license and the original asset for the purchased offer. Enforce unique token hashes. Protect all private records with ownership checks.

No new database tables or upload/payment/download endpoints are added in this schema step. The existing create-offer endpoint still accepts Terms. MediaListing is the expanded blueprint for the next API update, and its additional metadata is not yet included in signed v1 offer content. Do not silently rewrite previously signed offers; adoption requires an explicit API/event version decision. NIP-99 remains separate work.

## Verification

Run npm test from backend/. New tests cover valid and invalid media metadata, private-field rejection, acceptance/order references and download expiry/consumption state. No additional npm packages are required.
