import { CheckCircle, Calendar } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/Card";
import { ContentPreview } from "@/components/offer/ContentPreview";
import { LicenseDetails } from "@/components/offer/LicenseDetails";

const mockOffer = {
  offerId: "sample-offer",
  title: "Summer Campaign Video",
  description: "Short promotional video for social media.",
  contentUrl: "https://res.cloudinary.com/demo/video.mp4",
  brandName: "Acme Kenya",
  priceSats: 5000,
  licenseType: "30_DAY_SOCIAL",
  licenseDescription: "Use on social media for 30 days.",
  status: "LICENSED",
  nostrEventId: "nevent1sample",
  creatorHandle: "@creator",
  licensedAt: new Date().toISOString(),
  licenseNostrEventId: "nevent1license123456",
};

export default function LicensedConfirmationPage() {
  const licensedDate = new Date(mockOffer.licensedAt).toLocaleDateString(
    "en-US",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  return (
    <main>
      <Navbar backHref="/" />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-center">
          <CheckCircle size={56} className="mx-auto text-success" />
          <h1 className="mt-4 text-2xl font-bold text-success">LICENSED</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your license has been confirmed.
          </p>
        </div>

        <Card className="mt-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="col-span-1">
              <div className="flex items-center gap-4">
                <ContentPreview
                  url={mockOffer.contentUrl}
                  title={mockOffer.title}
                  size="small"
                />
                <div>
                  <p className="font-semibold text-text-primary">
                    {mockOffer.title}
                  </p>
                </div>
              </div>
            </div>

            <div className="col-span-2 grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
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
                  Licensed
                </p>
                <p className="mt-1 text-sm text-text-primary">{licensedDate}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Public Verification
                </p>
                <div className="mt-2 space-y-2">
                  <p className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle size={14} /> Payment confirmed
                  </p>
                  <p className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle size={14} /> License recorded on Nostr
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Nostr Event
            </p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-2.5">
              <div>
                <code className="text-xs text-text-secondary">
                  {mockOffer.licenseNostrEventId}
                </code>
              </div>
              <a
                href={`https://njump.me/${mockOffer.licenseNostrEventId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                View Nostr Event
              </a>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href={`/offers/${mockOffer.offerId}`}
              className="inline-block rounded-md bg-brand px-6 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              View Offer
            </a>
          </div>
        </Card>
      </div>
    </main>
  );
}
