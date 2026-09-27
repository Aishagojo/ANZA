import { Navbar } from "@/components/layout/Navbar";
import { OfferForm } from "@/components/offer/OfferForm";

/** Screen 2 — Creator Offer Form (spec section 9/10). All logic lives in OfferForm. */
export default function CreateOfferPage() {
  return (
    <main>
      <Navbar backHref="/" />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold text-text-primary">Create Licensing Offer</h1>
        <p className="mt-1 mb-8 text-sm text-text-secondary">
          Define how your content can be licensed.
        </p>
        <OfferForm />
      </div>
    </main>
  );
}
