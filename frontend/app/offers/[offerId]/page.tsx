"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, ExternalLink, Calendar } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ContentPreview } from "@/components/offer/ContentPreview";
import { VerificationCard } from "@/components/offer/VerificationCard";
import { LicenseDetails } from "@/components/offer/LicenseDetails";
import { getOffer } from "@/lib/api";
import { Offer } from "@/lib/types";

/**
 * Screen 3 (Public Offer Page) AND Screen 5 (Licensed Confirmation) share
 * this one route, per spec section 20: "There does not need to be a
 * separate route for Screen 5. The offer page should conditionally render
 * based on the offer status."
 *
 * Data comes from GET /api/offers/:offerId (lib/api.getOffer). We render:
 *   - status OPEN / PAYMENT_PENDING -> public offer view with Purchase CTA
 *   - status LICENSED               -> licensed confirmation view
 */
export default function OfferPage({ params }: { params: { offerId: string } }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOffer(params.offerId)
      .then((data) => {
        if (!cancelled) setOffer(data);
      })
      .catch(() => {
        if (!cancelled) setError("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  if (error) {
    return (
      <main>
        <Navbar backHref="/" />
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <h1 className="text-lg font-semibold text-text-primary">
            Unable to load this offer.
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            The offer may no longer exist or the service may be temporarily
            unavailable.
          </p>
        </div>
      </main>
    );
  }

  if (!offer) {
    // BACKEND TEAM: replace with a skeleton component once real network
    // latency is in play — a plain loading line is enough for the mock.
    return (
      <main>
        <Navbar backHref="/" />
        <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-text-secondary">
          Loading offer…
        </div>
      </main>
    );
  }

  return offer.status === "LICENSED" ? (
    <LicensedView offer={offer} />
  ) : (
    <PublicOfferView offer={offer} />
  );
}

/** Screen 3 — spec section 11/12/13 */
function PublicOfferView({ offer }: { offer: Offer }) {
  return (
    <main>
      <Navbar backHref="/" verified />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <ContentPreview url={offer.contentUrl} title={offer.title} />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{offer.title}</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Created by {offer.creatorHandle}
            </p>
          </div>
        </div>

        <Card className="mt-8">
          <LicenseDetails offer={offer} />

          <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Status
              </p>
              <div className="mt-1">
                <StatusBadge status={offer.status} />
              </div>
            </div>
          </div>

          {/* Only show the purchase CTA while the offer is still open —
              never once it's LICENSED (this whole branch only renders
              pre-LICENSED anyway, but PAYMENT_PENDING also hides it). */}
          {offer.status === "OPEN" && (
            <Link href={`/offers/${offer.offerId}/pay`} className="mt-6 block">
              <Button fullWidth>Purchase License</Button>
            </Link>
          )}
          {offer.status === "PAYMENT_PENDING" && (
            <Link href={`/offers/${offer.offerId}/pay`} className="mt-6 block">
              <Button fullWidth variant="secondary">
                Resume payment
              </Button>
            </Link>
          )}
        </Card>

        <div className="mt-6">
          <VerificationCard eventId={offer.nostrEventId} />
        </div>
      </div>
    </main>
  );
}

/** Screen 5 — spec section 18/19 */
function LicensedView({ offer }: { offer: Offer }) {
  const licensedDate = offer.licensedAt
    ? new Date(offer.licensedAt).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <main>
      <Navbar backHref="/" />
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <CheckCircle size={56} className="mx-auto text-success" />
        <h1 className="mt-4 text-2xl font-bold text-success">LICENSED</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your license has been confirmed.
        </p>

        <Card className="mt-8 text-left">
          <div className="flex items-center gap-4">
            <ContentPreview url={offer.contentUrl} title={offer.title} size="small" />
            <p className="font-semibold text-text-primary">{offer.title}</p>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <LicenseDetails offer={offer} />
            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Calendar size={14} /> Licensed
            </div>
            <p className="mt-1 text-sm font-medium text-text-primary">{licensedDate}</p>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <p className="mb-3 text-sm font-semibold text-text-primary">
              Public Verification
            </p>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle size={14} /> Payment confirmed
              </p>
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle size={14} /> License recorded on Nostr
              </p>
            </div>

            {offer.licenseNostrEventId && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Nostr Event
                  </p>
                  <code className="text-xs text-text-secondary">
                    {offer.licenseNostrEventId.slice(0, 20)}...
                  </code>
                </div>
                {/*
                  BACKEND/PRODUCT TEAM: point this at a real Nostr explorer,
                  e.g. `https://njump.me/${offer.licenseNostrEventId}`, once
                  events are actually published to a relay.
                */}
                <a
                  href={`https://njump.me/${offer.licenseNostrEventId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  View Event <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
