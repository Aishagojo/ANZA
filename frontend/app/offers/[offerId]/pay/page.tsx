"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/Card";
import { ContentPreview } from "@/components/offer/ContentPreview";
import { LightningQR } from "@/components/payment/LightningQR";
import { InvoiceDisplay } from "@/components/payment/InvoiceDisplay";
import { PaymentStatus } from "@/components/payment/PaymentStatus";
import { createPaymentRequest, getOffer, getOfferStatus } from "@/lib/api";
import { Offer, PaymentRequestResponse } from "@/lib/types";
import { LICENSE_TYPE_LABELS } from "@/lib/licenseTypes";

const POLL_INTERVAL_MS = Number(
  process.env.NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS ?? 3000,
);

/**
 * Screen 4 — Payment Page (spec sections 15, 16, 17).
 *
 * Flow:
 *   1. On mount: load the offer (for the summary panel) and request a
 *      Lightning invoice via POST /api/offers/:offerId/payment.
 *   2. Once an invoice exists, poll GET /api/offers/:offerId/status on an
 *      interval until it reports a settled payment.
 *
 * IMPORTANT (spec section 16/17): this page must NEVER show "payment
 * received" on its own — that state is only set from the polled backend
 * response. If your backend supports SSE/WebSockets instead of polling,
 * replace the `setInterval` block below with a subscription; everything
 * else on this page stays the same.
 */
export default function PaymentPage({
  params,
}: {
  params: { offerId: string };
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [payment, setPayment] = useState<PaymentRequestResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 1: load offer summary + create the Lightning invoice.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [offerData, paymentData] = await Promise.all([
          getOffer(params.offerId),
          createPaymentRequest(params.offerId),
        ]);
        if (cancelled) return;
        setOffer(offerData);
        setPayment(paymentData);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start payment for this offer.";
        if (!cancelled) setError(message);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  // Step 2: poll for confirmation once we have an active invoice.
  useEffect(() => {
    if (!payment || confirmed) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await getOfferStatus(params.offerId);
        if (status.status === "LICENSED" || status.status === "PAYMENT_SETTLED") {
          setConfirmed(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // A transient poll failure isn't fatal — just try again next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [payment, confirmed, params.offerId]);

  if (error) {
    return (
      <main>
        <Navbar backHref={`/offers/${params.offerId}`} />
        <div className="mx-auto max-w-xl px-6 py-16 text-center text-sm text-text-secondary">
          {error}
        </div>
      </main>
    );
  }

  if (!offer || !payment) {
    return (
      <main>
        <Navbar backHref={`/offers/${params.offerId}`} />
        <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-text-secondary">
          Preparing your Lightning invoice…
        </div>
      </main>
    );
  }

  return (
    <main>
      <Navbar backHref={`/offers/${offer.offerId}`} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* LEFT: license summary */}
          <div>
            <div className="flex items-center gap-4">
              <ContentPreview
                url={offer.contentUrl}
                title={offer.title}
                size="small"
              />
              <div>
                <p className="font-semibold text-text-primary">{offer.title}</p>
                <p className="text-sm text-text-secondary mt-1">
                  {LICENSE_TYPE_LABELS[offer.licenseType]} License
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-white border border-border p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                License price
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl text-yellow-500">₿</span>
                <p className="text-3xl font-bold text-text-primary">
                  {payment.amountSats.toLocaleString()} sats
                </p>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                The Creator receives this amount when the Lightning invoice is paid.
              </p>
            </div>

            <Card className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Secure & Fast
              </h3>
              <p className="mb-4 text-sm text-text-secondary">
                Powered by Bitcoin Lightning for instant, low-cost payments.
              </p>

              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">
                    1
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">
                      You pay
                    </p>
                    <p className="text-sm text-text-secondary">
                      Scan the QR code or copy the invoice.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">
                    2
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">
                      We verify
                    </p>
                    <p className="text-sm text-text-secondary">
                      Payment is confirmed on the Lightning network.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold">
                    3
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-text-primary">
                      License is recorded
                    </p>
                    <p className="text-sm text-text-secondary">
                      A Nostr event is created and published.
                    </p>
                  </div>
                </li>
              </ol>
            </Card>
          </div>

          {/* RIGHT: payment instructions */}
          <Card>
            <div>
              <h2 className="mb-1 text-lg font-semibold text-text-primary">
                Pay with Bitcoin Lightning
              </h2>
              <p className="mb-6 text-sm text-text-secondary">
                Fast, low-cost payment using the Lightning Network.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex justify-center">
                <LightningQR paymentRequest={payment.paymentRequest} />
              </div>

              <div className="mt-4">
                <InvoiceDisplay paymentRequest={payment.paymentRequest} />
              </div>
            </div>

            <div className="mt-6">
              <PaymentStatus confirmed={confirmed} offerId={offer.offerId} />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
