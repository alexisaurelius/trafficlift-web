import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { CroPreviewSection } from "@/components/cro-preview-section";
import { CroIncludesSection } from "@/components/cro-includes-section";
import { CroProcessTimelineSection } from "@/components/cro-process-timeline-section";
import { Bot, CircleAlert, FilePenLine, GaugeCircle, SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "CRO Audits On Demand - TrafficLift",
  description:
    "Order AI-assisted SEO audits on demand. Track issues, prioritize fixes, and improve conversions with actionable reports.",
  alternates: {
    canonical: "https://www.trafficlift.ai/cro-audit/",
  },
};

export default async function CroAuditPage() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--on-surface)]">
      <header className="border-b border-[color:color-mix(in_oklab,var(--primary)_8%,white)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)]">
            <span>Traffic</span>
            <span className="relative inline-block -rotate-6 origin-bottom-left text-[#22c55e]">
              Lift
              <svg
                viewBox="0 0 48 12"
                width="44"
                height="10"
                aria-hidden="true"
                className="absolute left-0 top-[85%] rotate-6 text-[#22c55e]"
              >
                <path d="M1 9 L14 7 L24 8 L41 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M41 3.2 L37.3 1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M41 3.2 L38.6 5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="/" className="pb-2 text-sm font-semibold text-[var(--on-surface)]/65">
              SEO Audit
            </Link>
            <a href="#how" className="border-b-2 border-[#14bf68] pb-2 text-sm font-semibold text-[var(--primary)]">
              CRO Audit
            </a>
            <a href="#pricing" className="pb-2 text-sm font-semibold text-[var(--on-surface)]/65">
              Pricing
            </a>
            <a href="#case-studies" className="pb-2 text-sm font-semibold text-[var(--on-surface)]/65">
              Our Clients
            </a>
          </nav>
          <div className="hidden items-center gap-6 md:flex">
            <Link href={userId ? "/dashboard" : "/sign-in"} className="text-sm font-semibold text-[var(--primary)]/75">
              Sign In
            </Link>
            <Link href={userId ? "/dashboard" : "/sign-up"} className="rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-white">
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 md:px-6">
        <section className="relative mt-3 overflow-visible isolate">
          <div className="pointer-events-none absolute left-1/2 top-[46%] -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#dff2e6] opacity-85 blur-[48px]" />
          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 text-center md:px-6 md:py-20">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#bde9cb] px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#186c39]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#1bb65f]" /> AI-Powered Insights + Human Expertise
            </p>
            <h1 className="sr-only">CRO Audits On Demand</h1>
            <h2 className="font-manrope relative mx-auto mt-8 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-[var(--primary)] md:text-6xl">
              Find the Issues That
              <br />
              Are Costing You
              <br />
              <span className="text-[#25c468]">Conversions and Revenue</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-snug text-[var(--on-surface)]/70 md:text-xl">
              <span className="block md:whitespace-nowrap">Get a clear CRO action plan within 24 hours. Fix friction,</span>
              <span className="block md:whitespace-nowrap">improve user journeys, and increase checkout completion rates.</span>
            </p>
            <div className="mt-7 flex justify-center gap-3">
              <Link
                href={userId ? "/dashboard" : "/sign-up"}
                className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,22,57,0.16)] transition-transform duration-200 hover:scale-[1.05] md:text-base"
              >
                Get Your CRO Audit
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-xl bg-[#f4f6f7] px-6 py-3 text-sm font-bold text-[var(--primary)] transition-transform duration-200 hover:scale-[1.05] md:text-base"
              >
                See Sample Report
              </a>
            </div>
            <p className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-[var(--on-surface)]/70 md:text-base">
              <svg width="20" height="20" viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
                <polygon
                  points="50,2 63,12 80,8 84,24 98,34 90,50 98,66 84,76 80,92 63,88 50,98 37,88 20,92 16,76 2,66 10,50 2,34 16,24 20,8 37,12"
                  fill="#16a34a"
                />
                <path d="M29 52 L43 66 L72 37" fill="none" stroke="#f3f4f6" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Over 4,000+ audits delivered
            </p>
          </div>
        </section>

        <div className="-mt-6">
          <CroPreviewSection />
        </div>

        <section className="mt-14">
          <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">How We Compare</h2>
          <p className="mt-3 text-center text-lg text-[var(--on-surface)]/70">The fastest, most actionable CRO audit on the market.</p>

          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr_1fr]">
            <article className="min-h-[405px] rounded-2xl bg-[var(--surface-container-low)] p-7">
              <h3 className="font-manrope text-[24px] font-extrabold leading-tight text-[var(--primary)]">CRO Agencies</h3>
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--on-surface)]/45">Higher cost and slower delivery</p>
              <ul className="mt-6 space-y-4 text-[16px] text-[var(--on-surface)]/82">
                {[
                  "Expensive audits ($1,000+)",
                  "Longer delivery times (2-4 weeks)",
                  "Long onboarding flows",
                  "Reports may be hard to execute",
                  "Frequently upsell retainers",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#b91c1c] text-xs font-black text-white">×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="relative min-h-[405px] rounded-2xl border-[3px] border-[#22c55e] bg-[var(--primary)] p-7 text-white shadow-[0_14px_34px_rgba(0,22,57,0.2)]">
              <span className="absolute right-4 top-4 rounded-md bg-[#22c55e] px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--primary)]">
                Recommended
              </span>
              <h3 className="font-manrope text-[26px] font-extrabold leading-tight">TrafficLift CRO</h3>
              <p className="mt-1 text-base font-bold uppercase tracking-wide text-[#22c55e]">Starting at $14.99</p>
              <ul className="mt-6 space-y-3 text-[16px] leading-snug">
                {[
                  "Audit delivered within 24 hours",
                  "20+ conversion factors analyzed by AI trained on high-performing funnels",
                  "Audits are reviewed by CRO specialists",
                  "Created by SEO and CRO professionals with 12+ years of experience",
                  "Prioritized optimization list included",
                  "Step-by-step recommendations",
                  "Plain language explanations",
                  "Focused on measurable conversion lift and revenue impact",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-xs font-black text-[var(--primary)]">
                      ✓
                    </span>
                    <span className="pt-[1px]">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={userId ? "/dashboard" : "/sign-up"}
                className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#22c55e] px-5 py-3 text-base font-black text-[var(--primary)] transition-transform duration-200 hover:scale-[1.05]"
              >
                Get My CRO Audit
              </Link>
            </article>

            <article className="min-h-[405px] rounded-2xl bg-[var(--surface-container-low)] p-7">
              <h3 className="font-manrope text-[24px] font-extrabold leading-tight text-[var(--primary)]">Analytics-Only Tools</h3>
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--on-surface)]/45">Data-heavy, not action-focused</p>
              <ul className="mt-6 space-y-4 text-[16px] text-[var(--on-surface)]/82">
                {[
                  "Large amounts of raw data",
                  "Requires technical analysis",
                  "No clear action plan",
                  "No conversion prioritization",
                  "Subscription cost often $100+ monthly",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#b91c1c] text-xs font-black text-white">×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
            Most Websites Lose Conversions Without Realizing It
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Weak First Impression",
                body: "Visitors do not immediately see why your offer is worth acting on.",
                icon: <FilePenLine size={26} className="text-[#22c55e]" />,
                dark: true,
              },
              {
                title: "High Interaction Friction",
                body: "Forms, CTAs, and flow transitions create hesitation and increase drop-off.",
                icon: <CircleAlert size={26} className="text-[#dc2626]" />,
                dark: false,
              },
              {
                title: "Slow Decision Momentum",
                body: "Delayed trust signals and unclear next steps reduce conversion momentum.",
                icon: <GaugeCircle size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Message Mismatch",
                body: "Your ad or search intent may not match on-page messaging and user expectations.",
                icon: <SearchX size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Offer Clarity Gaps",
                body: "Benefits, pricing, and differentiation are not clear enough at decision points.",
                icon: <FilePenLine size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Not Optimized for AI Discovery",
                body: "Poor clarity for AI-assisted journeys can reduce qualified, high-intent traffic.",
                icon: <Bot size={26} className="text-[#22c55e]" />,
                dark: true,
              },
            ].map((item) => (
              <article
                key={item.title}
                className={`rounded-2xl p-7 ${item.dark ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--primary)]"}`}
              >
                {item.icon}
                <h3 className="mt-5 font-manrope text-[20px] font-extrabold leading-tight">{item.title}</h3>
                <p className={`mt-4 text-[15px] leading-relaxed ${item.dark ? "text-white/85" : "text-[var(--on-surface)]/78"}`}>
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <CroIncludesSection />

        <CroProcessTimelineSection />

        <section id="pricing" className="mt-14">
          <h2 className="text-center font-manrope text-2xl font-extrabold md:text-3xl">Transparent Pricing</h2>
          <p className="mt-2 text-center text-sm text-[var(--on-surface)]/70">No hidden fees. Professional CRO accessible to everyone.</p>
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              { name: "One-time", price: "$14.99", suffix: "/one-time", cta: "Select Basic", dark: false, perks: ["One full CRO audit of your submitted page", "All audit elements included", "Audits are stored permanently"] },
              { name: "Starter plan", price: "$39.99", suffix: "/mo", cta: "Select Starter", badge: "Popular", dark: true, perks: ["3 audits included", "Full CRO audit of your submitted pages", "All audit elements included", "Audits are stored permanently"] },
              { name: "Standard Plan", price: "$89.99", suffix: "/mo", cta: "Select Standard", dark: false, perks: ["10 audits included", "Full CRO audit of your submitted pages", "All audit elements included", "Audits are stored permanently"] },
              { name: "Pro Plan", price: "$129.99", suffix: "/mo", cta: "Select Pro", dark: false, perks: ["20 audits included", "Full CRO audit of your submitted pages", "All audit elements included", "Audits are stored permanently"] },
            ].map((plan) => (
              <article
                key={plan.name}
                className={`rounded-xl p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)] transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_18px_44px_rgba(0,22,57,0.16)] ${
                  plan.dark ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--on-surface)]"
                }`}
              >
                {plan.badge ? (
                  <div className="flex justify-end">
                    <span className="rounded-md bg-[#22c55e] px-3 py-1 text-[10px] font-black tracking-widest text-[var(--primary)]">
                      {plan.badge}
                    </span>
                  </div>
                ) : null}
                <p className="text-xs font-semibold uppercase tracking-wide">{plan.name}</p>
                <p className="font-manrope mt-3 text-4xl font-black">
                  {plan.price}
                  <span className={`ml-1 text-2xl font-semibold ${plan.dark ? "text-white/70" : "text-[var(--on-surface)]/60"}`}>{plan.suffix}</span>
                </p>
                <ul className="mt-6 space-y-3">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-3 text-sm">
                      <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#22c55e] text-[10px] font-black text-[var(--primary)]">
                        ✓
                      </span>
                      <span className={plan.dark ? "text-white/85" : "text-[var(--on-surface)]/78"}>{perk}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={userId ? "/dashboard/billing" : "/sign-up"}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-base font-black ${
                    plan.dark ? "bg-[var(--tertiary-fixed)] text-[var(--primary)]" : "bg-[var(--surface-container-lowest)] text-[var(--primary)]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="case-studies" className="mt-14">
          <h2 className="text-center font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)] md:text-3xl">
            What Our Customers Say
          </h2>
          <p className="mt-2 text-center text-sm text-[var(--on-surface)]/70 md:text-base">
            Real feedback from teams improving conversions with clear, prioritized actions.
          </p>
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4">
              {[
                { quote: "We changed three CTA blocks from the report and saw immediate uplift in demo requests.", name: "Mia, Ecommerce Manager", photo: "https://i.pravatar.cc/120?img=32", linkedinUrl: "#" },
                { quote: "The CRO audit helped us remove friction from checkout and recover lost revenue quickly.", name: "Daniel, Growth Lead", photo: "https://i.pravatar.cc/120?img=12", linkedinUrl: "#" },
                { quote: "Prioritized recommendations saved us weeks of guesswork and made testing far more effective.", name: "Sophia, Startup Founder", photo: "https://i.pravatar.cc/120?img=47", linkedinUrl: "#" },
              ].map((item) => (
                <article key={item.name} className="w-[320px] shrink-0 rounded-2xl bg-[var(--surface-container-lowest)] p-5 shadow-[0_10px_30px_rgba(0,22,57,0.06)]">
                  <p className="text-[15px] leading-relaxed text-[var(--on-surface)]/80">&quot;{item.quote}&quot;</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src={item.photo} alt={item.name} className="h-10 w-10 rounded-full object-cover" />
                      <p className="text-sm font-bold text-[var(--primary)]">{item.name}</p>
                    </div>
                    <a
                      href={item.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${item.name} LinkedIn profile`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary)] transition hover:bg-[var(--surface-container-low)]"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px] fill-current">
                        <path d="M20.45 20.45h-3.56V14.9c0-1.32-.03-3.02-1.84-3.02-1.84 0-2.12 1.44-2.12 2.92v5.65H9.37V9h3.42v1.56h.05c.48-.9 1.64-1.84 3.38-1.84 3.61 0 4.28 2.38 4.28 5.48v6.25ZM5.35 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.13 20.45H3.57V9h3.56v11.45Z" />
                      </svg>
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mt-12">
          <h2 className="text-center font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)] md:text-3xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 space-y-5">
            {[
              { q: "How long does the CRO audit take?", a: "Your CRO audit is reviewed by SEO specialists and delivered within 24 hours." },
              { q: "Will you implement the fixes?", a: "We identify and explain conversion issues and provide clear recommendations your team can implement quickly." },
              { q: "What data do I need to provide?", a: "You only need to provide the page URL and the primary conversion goal you want to improve." },
              { q: "How will I receive my audit?", a: "You will receive an email notification when your audit is ready. It will also be available in your TrafficLift dashboard." },
              { q: "Is my data secure?", a: "Yes. We treat your data as confidential and do not sell or share your audit data with third parties." },
            ].map((item) => (
              <article key={item.q} className="rounded-2xl bg-[var(--surface-container-lowest)] px-6 py-7">
                <h3 className="font-manrope text-lg font-extrabold leading-tight text-[var(--primary)] md:text-xl">{item.q}</h3>
                <p className="mt-3 max-w-6xl text-base leading-relaxed text-[var(--on-surface)]/78">{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-10 pb-8 text-center text-xs text-[var(--on-surface)]/55">© {new Date().getFullYear()} TrafficLift. All rights reserved.</footer>
      </main>
    </div>
  );
}
