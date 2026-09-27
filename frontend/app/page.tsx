import Link from "next/link";
import { FilePlus, Radio, Zap, ShieldCheck, ShieldCheck as VerifiedIcon } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";

/**
 * Screen 1 — Landing Page (spec section 8). Fully static: no backend calls,
 * no dynamic data. The only interaction is the "Create an Offer" CTA, which
 * is a plain Next.js <Link> to /create.
 */
export default function LandingPage() {
  return (
    <main>
      <Navbar />

      {/* Hero */}
      <section className="mx-auto grid max-w-page grid-cols-1 items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
            License creator content.
            <br />
            Prove the agreement.
            <br />
            <span className="text-brand">Pay instantly.</span>
          </h1>
          <p className="mt-6 max-w-md text-base text-text-secondary">
            Create licensing offers for your content, define usage rights, get
            paid with Bitcoin Lightning, and create a publicly verifiable
            licensing record.
          </p>
          <Link href="/create" className="mt-8 inline-block">
            <Button>Create an Offer →</Button>
          </Link>
        </div>

        {/* Right side — sample licensed-content card, matches spec section 8 */}
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="mb-4 aspect-video rounded-lg bg-surface" aria-hidden />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Summer Campaign Video
              </p>
              <p className="text-xs text-text-secondary">30-Day Social · 5,000 sats</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success">
              <VerifiedIcon size={12} /> Verifiable on Nostr
            </span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-page px-6 py-16">
          <h2 className="mb-10 text-2xl font-semibold text-text-primary">How it works</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Step
              icon={<FilePlus size={20} />}
              number="01"
              title="Create offer"
              description="Define your content, price and licensing terms."
            />
            <Step
              icon={<Radio size={20} />}
              number="02"
              title="Publish it"
              description="Your licensing offer becomes publicly available."
            />
            <Step
              icon={<Zap size={20} />}
              number="03"
              title="Get paid"
              description="The brand pays using Bitcoin Lightning."
            />
            <Step
              icon={<ShieldCheck size={20} />}
              number="04"
              title="Verify license"
              description="The licensing agreement is recorded on Nostr."
            />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Step({
  icon,
  number,
  title,
  description,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand">
        {icon}
      </div>
      <p className="mb-1 text-xs font-semibold text-text-secondary">{number}</p>
      <h3 className="mb-1 text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary">{description}</p>
    </div>
  );
}
