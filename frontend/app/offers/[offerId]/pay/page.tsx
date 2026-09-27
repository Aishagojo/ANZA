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
  process.env.NEXT_PUBLIC_STATUS_POLL_INTERVAL_MS ?? 3000
);

/**
 * Screen 4 — Payment Page (spec sections 15, 16, 17).
 *
 * Flow:
 *   1. On mount: load the offer (for the summary panel) and request a
 *      Lightning invoice via POST /api/offers/:offerId/payment.
 *   2. Once an invoice exists, poll GET /api/offers/:offerId/status on an
 *      interval until it reports "LICENSED".
 *
 * IMPORTANT (spec section 16/17): this page must NEVER show "payment
 * received" on its own — that state is only set from the polled backend
 * response. If your backend supports SSE/WebSockets instead of polling,
 * replace the `setInterval` block below with a subscription; everything
 * else on this page stays the same.
 */
export default function PaymentPage({ params }: { params: { offerId: string } }) {
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
      } catch {
        if (!cancelled) setError("Unable to start payment for this offer.");
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
        if (status.status === "LICENSED") {
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
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* LEFT: license summary */}
          <div>
            <div className="flex items-center gap-4">
              <ContentPreview url={offer.contentUrl} title={offer.title} size="small" />
              <div>
                <p className="font-semibold text-text-primary">{offer.title}</p>
                <p className="text-sm text-text-secondary">
                  {LICENSE_TYPE_LABELS[offer.licenseType]} License
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Amount
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {payment.amountSats.toLocaleString()} sats
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <ShieldCheck size={16} className="text-brand" /> Secure & fast
              </p>
              <p className="text-sm text-text-secondary">
                Powered by Bitcoin Lightning for instant, low-cost payments.
              </p>
            </div>
          </div>

          {/* RIGHT: payment instructions */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-text-primary">
              Pay with Bitcoin Lightning
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              Fast, low-cost payment using the Lightning Network.
            </p>

            <div className="flex justify-center">
              <LightningQR paymentRequest={payment.paymentRequest} />
            </div>

            <div className="mt-6">
              <InvoiceDisplay paymentRequest={payment.paymentRequest} />
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
