"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select } from "@/components/ui/FormFields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createOffer } from "@/lib/api";
import { LicenseType, CreateOfferPayload } from "@/lib/types";
import { probeSigner, SignerProbe } from "@/lib/nostr";
import {
  LICENSE_TYPE_DESCRIPTIONS,
  LICENSE_TYPE_LABELS,
  LICENSE_TYPE_OPTIONS,
} from "@/lib/licenseTypes";

type FormState = CreateOfferPayload;

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  contentUrl: "",
  brandName: "",
  priceSats: 0,
  licenseType: "30_DAY_SOCIAL",
  licenseDescription: LICENSE_TYPE_DESCRIPTIONS["30_DAY_SOCIAL"],
};

type Errors = Partial<Record<keyof FormState, string>>;

/** Spec section 9/10 — validates, shows a preview, then publishes via lib/api.createOffer. */
export function OfferForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [signer, setSigner] = useState<SignerProbe | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const [probing, setProbing] = useState(false);

  async function runProbe() {
    setProbing(true);
    try {
      setSigner(await probeSigner());
    } finally {
      setProbing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    probeSigner().then((result) => {
      if (!cancelled) setSigner(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLicenseTypeChange(type: LicenseType) {
    setForm((prev) => ({
      ...prev,
      licenseType: type,
      // Auto-fill the description, but don't clobber a description the
      // creator has already hand-edited away from a previous default.
      licenseDescription:
        prev.licenseDescription === LICENSE_TYPE_DESCRIPTIONS[prev.licenseType]
          ? LICENSE_TYPE_DESCRIPTIONS[type]
          : prev.licenseDescription,
    }));
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!form.title.trim()) next.title = "Content title is required.";
    if (!form.description.trim()) next.description = "Description is required.";
    if (!/^https?:\/\/.+/.test(form.contentUrl.trim()))
      next.contentUrl = "Please enter a valid content URL.";
    if (!form.brandName.trim()) next.brandName = "Brand is required.";
    if (!form.priceSats || form.priceSats <= 0)
      next.priceSats = "Price must be greater than 0.";
    if (!form.licenseDescription.trim())
      next.licenseDescription = "License description is required.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) setStep("preview");
  }

  async function handlePublish() {
    setSubmitting(true);
    setSubmitError(null);
    if (signer?.status !== "connected") {
  setSubmitError(
    signer?.status === "locked"
      ? "Your Nostr extension is installed but locked. Unlock it (and add an account) in your browser toolbar, then press Retry."
      : "No Nostr extension detected. Install Alby or Flamingo, add an account, then press Retry."
  );
  setSubmitting(false);
  return;
  }
    try {

      const res = await createOffer(form);
      // BACKEND TEAM: res.publicUrl is returned by POST /api/offers — we use
      // res.offerId directly since our route is always /offers/:offerId.
      router.push(`/offers/${res.offerId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong publishing this offer. Please try again."
      );
      setSubmitting(false);
    }
  }

  if (step === "preview") {
    return (
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-text-primary">
          Preview offer
        </h2>
        <p className="mb-6 text-sm text-text-secondary">
          Check the details below before publishing. Publishing creates a
          public, shareable licensing offer.
        </p>

        <SignerBanner signer={signer} probing={probing} onRetry={runProbe} />

        <dl className="mb-6 space-y-4 rounded-lg bg-surface p-5">
          <PreviewRow label="Content title" value={form.title} />
          <PreviewRow label="Description" value={form.description} />
          <PreviewRow label="Content URL" value={form.contentUrl} />
          <PreviewRow label="Brand" value={form.brandName} />
          <PreviewRow label="Price" value={`${form.priceSats.toLocaleString()} sats`} />
          <PreviewRow label="License type" value={LICENSE_TYPE_LABELS[form.licenseType]} />
          <PreviewRow label="License description" value={form.licenseDescription} />
        </dl>

        {submitError && (
          <p className="mb-4 text-sm font-medium text-red-600">{submitError}</p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button
            variant="secondary"
            type="button"
            onClick={() => setStep("edit")}
            disabled={submitting}
          >
            Edit
          </Button>
          <Button
            type="button"
            fullWidth
            onClick={handlePublish}
            disabled={submitting}
          >
            {submitting ? "Publishing…" : "Publish Offer"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handlePreview} className="space-y-5">
        <Input
          label="Content Title"
          placeholder="Summer Campaign Video"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          error={errors.title}
        />

        <Textarea
          label="Description"
          placeholder="Short promotional video for social media featuring our latest product launch."
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          error={errors.description}
        />

        <Input
          label="Content URL"
          placeholder="https://res.cloudinary.com/..."
          hint="Use a publicly accessible image or video URL."
          value={form.contentUrl}
          onChange={(e) => update("contentUrl", e.target.value)}
          error={errors.contentUrl}
        />

        <Input
          label="Brand"
          placeholder="Acme Kenya"
          value={form.brandName}
          onChange={(e) => update("brandName", e.target.value)}
          error={errors.brandName}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Price (sats)"
            type="number"
            min={1}
            placeholder="5000"
            value={form.priceSats || ""}
            onChange={(e) => update("priceSats", Number(e.target.value))}
            error={errors.priceSats}
          />

          <Select
            label="License Type"
            value={form.licenseType}
            onChange={(e) => handleLicenseTypeChange(e.target.value as LicenseType)}
          >
            {LICENSE_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {LICENSE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="License Description"
          value={form.licenseDescription}
          onChange={(e) => update("licenseDescription", e.target.value)}
          error={errors.licenseDescription}
        />

        <Button type="submit" fullWidth>
          Preview Offer →
        </Button>
      </form>
    </Card>
  );
}
function SignerBanner({
  signer,
  probing,
  onRetry,
}: {
  signer: SignerProbe | null;
  probing: boolean;
  onRetry: () => void;
}) {
  if (signer === null) {
    return (
      <div className="mb-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        Checking for a Nostr signer…
      </div>
    );
  }

  if (signer.status === "connected") {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-success bg-success-bg px-4 py-3 text-sm">
        <span className="h-2 w-2 rounded-full bg-success" />
        Publishing as{" "}
        <code className="font-mono text-xs">
          {signer.pubkey.slice(0, 8)}…{signer.pubkey.slice(-6)}
        </code>
      </div>
    );
  }

  const locked = signer.status === "locked";

  return (
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm">
      <p className="font-medium text-amber-800">
        {locked
          ? "Your Nostr extension is installed but not ready yet."
          : "A Nostr signer is required to publish an offer."}
      </p>

      <p className="mt-1 text-amber-700">
        {locked
          ? "Flamingo is detected, but it has no usable account. Set one up, then retry."
          : "Install a Nostr browser extension, then add an account to sign your offer."}
      </p>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-amber-700">
        <li>
          {locked ? (
            <>Click the Flamingo icon in your browser toolbar.</>
          ) : (
            <>
              Install a Nostr extension —{" "}
              <a href="https://getflamingo.org" target="_blank" rel="noopener noreferrer" className="font-medium underline">
                Flamingo
              </a>{" "}
              or{" "}
              <a href="https://getalby.com" target="_blank" rel="noopener noreferrer" className="font-medium underline">
                Alby
              </a>
              .
            </>
          )}
        </li>
        <li>
          New to Nostr? Choose <strong>Create account</strong> inside the extension and
          set a password. This generates your keypair.
        </li>
        <li>
          Already have one? Use <strong>Import account</strong> and paste your{" "}
          <code className="font-mono text-xs">nsec…</code> or{" "}
          <code className="font-mono text-xs">nprofile…</code> secret.
        </li>
        <li>Unlock the extension so it can answer signing requests.</li>
        <li>
          Allow the extension to access{" "}
          <code className="font-mono text-xs">{typeof window !== "undefined" ? window.location.host : "this site"}</code>.
        </li>
      </ol>

      <p className="mt-3 text-amber-700">
        Your key never reaches this app. Signing happens inside the extension.
      </p>

      <button
        type="button"
        onClick={onRetry}
        disabled={probing}
        className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
      >
        {probing ? "Checking…" : "Retry"}
      </button>
    </div>
  );
}
function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-text-primary">{value}</dd>
    </div>
  );
}
