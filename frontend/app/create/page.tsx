import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { OfferForm } from "@/components/offer/OfferForm";

/**
 * Screen 2 — Creator Offer Form.
 *
 * The form reads `?videoId=` when the creator arrives from one of their own
 * video cards. `useSearchParams` requires a Suspense boundary during static
 * rendering, so the form is wrapped here rather than inside the form itself.
 */
export default function CreateOfferPage() {
  return (
    <main>
      <Navbar backHref="/creator-profile" />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold text-text-primary">Create Licensing Offer</h1>
        <p className="mt-1 mb-8 text-sm text-text-secondary">
          Define how your content can be licensed.
        </p>
        <Suspense
          fallback={
            <p className="py-12 text-center text-sm text-text-secondary">
              Loading the offer form…
            </p>
          }
        >
          <OfferForm />
        </Suspense>
      </div>
    </main>
  );
}
