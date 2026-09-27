# Day 1: Nostr event design

Status: application-specific experimental payloads, not a standardized licensing NIP. Builders return unsigned templates; they perform no network calls.

## Envelope and kind choice

Use the Nostr event fields `pubkey`, `created_at`, `kind`, `tags`, and string `content`; signing adds `id` and `sig`. Cross-event references use `e` tags and creator references use `p` tags. The design follows [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

Both kinds must be separately configured from the regular-event range 1000–9999 after checking the current kind registry for collisions. There is deliberately no production default. Test fixtures use arbitrary kind numbers only. ContentPort clients must check the configured kind AND payload schema AND signature; a hashtag alone is not authentication.

We avoid replaceable application storage for this record chain: [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) uses kind 30078, where later data can replace an earlier version. Regular events fit the intended historical record better, but relay retention is still not guaranteed.

## Offer: creator signed

`buildOfferEvent` accepts creator key, designated attestor key, Terms, kind, and Unix creation time. It returns tags `[["t", "contentport-offer-v1"]]` and JSON-stringified content:

```text
{
  schema: "contentport.offer.v1",
  terms: <Terms from the shared schema>,
  attestor_pubkey: <ContentPort settlement attestor public key>
}
```

The creator signs the complete template using their own signer. The backend validates the signature and exact terms before queuing it. The signed attestor key explicitly identifies who is trusted to publish the automatic settlement statement.

## License: service attestation

`buildLicenseEvent` takes an already signature-verified offer and a wallet-verified Settlement. It rejects mismatched offer references, amounts, attestors, and settlement times before the offer. It emits `e` (offer ID), `p` (creator key), and `t=contentport-license-v1` tags.

Content includes `schema: "contentport.license.v1"`, `offer_event_id`, `payment_hash`, `amount_sats`, `starts_at`, `ends_at`, and `evidence_type: "contentport-settlement-attestation"`. Fixed durations start at settlement; perpetual duration has no end. The service signs with the attestor key designated in the offer, allowing automatic publication while the creator is offline.

This is an explicit trust tradeoff: anyone can verify the two signatures and their relationship, but the settlement assertion relies on the attestor's wallet verification. It is not independent cryptographic proof that a particular brand paid. Buyer acceptance remains private in v1; a jointly signed brand acceptance is future work.

## Verification and publication requirements

Before production, implement cryptographic event verification, configured kind checks, payload version checks, and timestamp policy at ingestion. Shape validation alone is insufficient. Builders deliberately accept no private keys. Store the finished signed event once and retry those same bytes and ID. Keep an outbox so settlement and publication can recover independently after a crash.

The public record omits invoices, preimages, buyer contact details, and wallet connection secrets. Export retained signed events for independent verification. A signed timestamp is author-supplied; neither timestamp nor relay acknowledgement guarantees permanent storage, legal identity, or brand acceptance.

Protocol sources checked on 2026-09-27. Final kind selection and relay interoperability remain implementation prerequisites.
