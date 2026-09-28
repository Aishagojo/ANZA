import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/Card";
import { ContentPreview } from "@/components/offer/ContentPreview";
import { ContentPreviewDemo } from "@/components/offer/ContentPreviewDemo";
import { LightningQR } from "@/components/payment/LightningQR";
import { InvoiceDisplay } from "@/components/payment/InvoiceDisplay";
import { PaymentStatus } from "@/components/payment/PaymentStatus";

const mockOffer = {
  offerId: "sample-offer",
  title: "Summer Campaign Video",
  description: "Short promotional video for social media.",
  contentUrl: "https://youtube.com/shorts/lR7MgiIWtM8?si=NcvEx6_wl_Pfx3Ju",
  brandName: "Acme Kenya",
  priceSats: 5000,
  licenseType: "30_DAY_SOCIAL",
  licenseDescription: "Use on social media for 30 days.",
  status: "PAYMENT_PENDING",
  nostrEventId: "nevent1sample",
  creatorHandle: "@creator",
};

const fakeInvoice = `lnbc${mockOffer.priceSats}n1pabcdefg...`;

export default function SamplePayPage() {
  return (
    <main>
      <Navbar backHref={`/offers/${mockOffer.offerId}`} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
              <div className="flex items-center gap-4">
                <ContentPreviewDemo url={mockOffer.contentUrl} title={mockOffer.title} size="small" />
              <div>
                <p className="font-semibold text-text-primary">{mockOffer.title}</p>
                <p className="text-sm text-text-secondary mt-1">30-Day Social License</p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-white border border-border p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Amount</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl text-yellow-500">₿</span>
                <p className="text-3xl font-bold text-text-primary">{mockOffer.priceSats.toLocaleString()} sats</p>
              </div>
            </div>

            <Card className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Secure & Fast</h3>
              <p className="mb-4 text-sm text-text-secondary">Powered by Bitcoin Lightning for instant, low-cost payments.</p>

              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">1</div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">You pay</p>
                    <p className="text-sm text-text-secondary">Scan the QR code or copy the invoice.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">2</div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">We verify</p>
                    <p className="text-sm text-text-secondary">Payment is confirmed on the Lightning network.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">3</div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">License is recorded</p>
                    <p className="text-sm text-text-secondary">A Nostr event is created and published.</p>
                  </div>
                </li>
              </ol>
            </Card>
          </div>

          <Card>
            <div>
              <h2 className="mb-1 text-lg font-semibold text-text-primary">Pay with Bitcoin Lightning</h2>
              <p className="mb-6 text-sm text-text-secondary">Fast, low-cost payment using the Lightning Network.</p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex justify-center">
                <LightningQR paymentRequest={fakeInvoice} />
              </div>

              <div className="mt-4">
                <InvoiceDisplay paymentRequest={fakeInvoice} />
              </div>
            </div>

            <div className="mt-6">
              <PaymentStatus confirmed={false} offerId={mockOffer.offerId} />
            </div>

            
          </Card>
        </div>
      </div>
    </main>
  );
}
