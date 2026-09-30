import Link from "next/link";
import {
  ArrowRight,
  FilePlus,
  Radio,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";

/**
 * Screen 1 — Landing Page (spec section 8). Fully static: no backend calls,
 * no dynamic data. The only interactions are plain Next.js <Link>s
 * ("Create an Offer" -> /create, "How it works" -> #how-it-works).
 *
 * Layout idea: the hero and "How it works" share ONE continuous background
 * (a soft white -> slate gradient that ends exactly on the footer's top
 * colour). There are no borders or colour blocks between sections, so
 * nothing looks "cut" — the separation comes from spacing and one soft
 * glowing divider, the same one the footer uses.
 */

const steps: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FilePlus,
    title: "Create offer",
    description: "Define your content, price and licensing terms.",
  },
  {
    icon: Radio,
    title: "Publish it",
    description: "Your licensing offer becomes publicly available.",
  },
  {
    icon: Zap,
    title: "Get paid",
    description: "The brand pays using Bitcoin Lightning.",
  },
  {
    icon: ShieldCheck,
    title: "Verify license",
    description: "The licensing agreement is recorded on Nostr.",
  },
];

export default function LandingPage() {
  return (
    <>
      <LandingHeader />

      <main>
        <div className="relative isolate overflow-x-clip bg-gradient-to-b from-white via-slate-50 to-slate-100">
          {/* Ambient glows: pure decoration, they fade out on their own */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="absolute -right-24 top-0 h-[26rem] w-[36rem] rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute right-[10%] top-72 h-56 w-56 rounded-full bg-bitcoin/10 blur-3xl" />
            <div className="absolute -left-32 top-40 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />
          </div>

          {/* ───────── Hero ───────── */}
          <section className="mx-auto grid w-full max-w-page items-center gap-12 px-4 pb-16 pt-8 md:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 sm:px-6 lg:pb-20 lg:pt-14">
            <div>
              <h1 className="text-[2rem] font-bold leading-[1.08] tracking-tight text-slate-900 min-[440px]:text-[2.4rem] sm:text-[2.75rem] lg:text-[clamp(2rem,3.1vw,2.5rem)]">
                License creator content.
                <br />
                Prove the agreement.
                <br />
                <span className="text-blue-600">Pay instantly.</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-600 md:text-lg">
                Create licensing offers for your content, define usage rights,
                get paid with Bitcoin Lightning, and create a publicly
                verifiable licensing record.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
                <Link
                  href="/create"
                  className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/40 active:translate-y-0"
                >
                  Create an Offer
                  <ArrowRight
                    size={16}
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-md shadow-slate-300/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-lg active:translate-y-0"
                >
                  How it works
                </Link>
              </div>
            </div>

            {/* Illustration card (natural 3:2 ratio, never cropped) */}
            <div className="relative">
              <div className="hero-float relative">
                <div className="lift-card rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-400/30">
                  <div className="overflow-hidden rounded-xl">
                    <img
                      src="/images/landing.png"
                      alt="ContentPort workflow — Create, Publish, Get Paid, Verify"
                      width={1536}
                      height={1024}
                      loading="eager"
                      decoding="async"
                      className="block h-auto w-full"
                    />
                  </div>
                </div>

                {/* Floating badges */}
                <div className="absolute -left-2 -top-3 z-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg sm:-left-3">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Verified on Nostr
                  </span>
                </div>
                <div className="absolute -bottom-3 -right-2 z-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg sm:-right-3">
                  <Zap size={13} className="text-bitcoin" aria-hidden />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Instant payment
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Soft glowing divider (same language as the footer's) */}
          <div aria-hidden className="mx-auto w-full max-w-page px-4 sm:px-6">
            <div className="relative h-px">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
            </div>
          </div>

          {/* ───────── How it works ───────── */}
          <section id="how-it-works" className="scroll-mt-20">
            <div className="mx-auto max-w-page px-4 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-20">
              <div className="mb-12 max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                  How it works
                </h2>
                <p className="mt-3 text-base leading-relaxed text-slate-500">
                  From your content to a publicly verifiable license, in four
                  simple steps.
                </p>
              </div>

              <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
                {steps.map((step, i) => (
                  <Step
                    key={step.title}
                    icon={step.icon}
                    number={String(i + 1).padStart(2, "0")}
                    title={step.title}
                    description={step.description}
                    last={i === steps.length - 1}
                  />
                ))}
              </ol>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Step({
  icon: Icon,
  number,
  title,
  description,
  last,
}: {
  icon: LucideIcon;
  number: string;
  title: string;
  description: string;
  last: boolean;
}) {
  return (
    <li className="lift-card group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-md shadow-slate-300/40">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border-t border-white/30 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/30 transition-transform duration-300 group-hover:scale-105">
        <Icon size={22} aria-hidden />
      </div>
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
        <span className="h-1 w-1 rounded-full bg-blue-600" aria-hidden />
        {number}
      </p>
      <h3 className="mb-2 font-bold tracking-tight text-slate-900">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-500">{description}</p>

      {/* Small arrow between cards (4-column layout only) */}
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-[22px] top-[38px] z-10 hidden h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-600 shadow-sm md:flex"
        >
          <ArrowRight size={11} />
        </span>
      )}
    </li>
  );
}
