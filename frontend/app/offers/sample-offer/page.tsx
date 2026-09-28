/*
  Demo public offer page (static)
  A lightweight static page used for UI demos. Uses mock data and the
  client-only `ContentPreviewDemo` so YouTube shorts autoplay works in
  the demo without affecting production routes.
*/
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ContentPreview } from "@/components/offer/ContentPreview";
import { ContentPreviewDemo } from "@/components/offer/ContentPreviewDemo";
import { LicenseDetails } from "@/components/offer/LicenseDetails";
import { VerificationCard } from "@/components/offer/VerificationCard";

const mockOffer = {
  offerId: "sample-offer",
  title: "Summer Campaign Video",
  description: "Short promotional video for social media.",
  contentUrl: "https://youtube.com/shorts/lR7MgiIWtM8?si=NcvEx6_wl_Pfx3Ju",
  brandName: "Acme Kenya",
  priceSats: 5000,
  licenseType: "30_DAY_SOCIAL",
  licenseDescription: "Use on social media for 30 days.",
  status: "OPEN",
  nostrEventId: "nevent1sample",
  creatorHandle: "@creator",
};

export default function SampleOfferPage() {
  return (
    <main>
      <Navbar backHref="/" verified />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <ContentPreviewDemo
            url={mockOffer.contentUrl}
            title={mockOffer.title}
          />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {mockOffer.title}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Created by {mockOffer.creatorHandle}
            </p>
          </div>
        </div>
        <Card className="mt-8">
          <LicenseDetails offer={mockOffer as any} />

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Licensed to
              </p>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {mockOffer.brandName}
              </p>
              <p className="mt-3 text-xs text-text-secondary">License</p>
              <p className="mt-1 text-sm text-text-primary">30-Day Social</p>
              <p className="mt-3 text-xs text-text-secondary">Price</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {mockOffer.priceSats.toLocaleString()} sats
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Status
              </p>
              <div className="mt-1">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Available
                </span>
              </div>
            </div>

            <div className="flex items-end">
              <Link
                href={`/offers/${mockOffer.offerId}/pay`}
                className="mt-0 w-full"
              >
                <Button fullWidth>Purchase License</Button>
              </Link>
            </div>
          </div>
        </Card>

        <div className="mt-6">
          <VerificationCard eventId={mockOffer.nostrEventId} />
        </div>
      </div>
    </main>
  );
}
