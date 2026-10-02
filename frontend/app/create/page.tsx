import { Suspense } from "react";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { OfferForm } from "@/components/offer/OfferForm";

/**
 * Creator Offer Form.
 *
 * The form reads `?videoId=` when the creator arrives from one of their own
 * video rows. `useSearchParams` requires a Suspense boundary during static
 * rendering, so the form is wrapped here rather than inside the form itself.
 */
export default function CreateOfferPage() {
  return (
    <AppShell role="creator" active="videos" width="max-w-3xl">
      <PageHeader
        crumbs={[{ label: "My Videos", href: "/creator-profile" }, { label: "Create Offer" }]}
        eyebrow="Creator"
        title="Create Licensing Offer"
        subtitle="Define how your content can be licensed."
      />
      <Suspense
        fallback={
          <p className="py-12 text-center text-sm text-slate-500">Loading the offer form…</p>
        }
      >
        <OfferForm />
      </Suspense>
    </AppShell>
  );
}
