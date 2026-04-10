import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { AuditPreviewSection } from "@/components/audit-preview-section";
import { AuditIncludesSection } from "@/components/audit-includes-section";
import { ProcessTimelineSection } from "@/components/process-timeline-section";
import {
  Bot,
  CircleAlert,
  FilePenLine,
  GaugeCircle,
  SearchX,
} from "lucide-react";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--on-surface)]">
      <header className="border-b border-[color:color-mix(in_oklab,var(--primary)_8%,white)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3">
          <p className="font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)]">
            <span>Traffic</span>
            <span className="relative inline-block -rotate-6 origin-bottom-left">
              Lift
              <svg
                viewBox="0 0 48 12"
                width="44"
                height="10"
                aria-hidden="true"
                className="absolute left-0 top-[85%] rotate-6 text-[#22c55e]"
              >
                <path
                  d="M1 9 L14 7 L24 8 L41 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M41 3.2 L37.3 1.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M41 3.2 L38.6 5.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </p>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how" className="border-b-2 border-[#14bf68] pb-2 text-sm font-semibold text-[var(--primary)]">
              Audit
            </a>
            <a href="#pricing" className="pb-2 text-sm font-semibold text-[var(--on-surface)]/65">
              Pricing
            </a>
            <a href="#case-studies" className="pb-2 text-sm font-semibold text-[var(--on-surface)]/65">
              Case Studies
            </a>
          </nav>
          <div className="hidden items-center gap-6 md:flex">
            <Link href={userId ? "/dashboard" : "/sign-in"} className="text-sm font-semibold text-[var(--primary)]/75">
              Login
            </Link>
            <Link
              href={userId ? "/dashboard" : "/sign-in"}
              className="rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-white"
            >
              Get Started
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
            <h1 className="font-manrope relative mx-auto mt-8 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-[var(--primary)] md:text-6xl">
              Find the Issues That
              <br />
              Are Costing You
              <br />
              <span className="text-[#25c468]">Traffic and Revenue</span>
            </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-snug text-[var(--on-surface)]/70 md:text-xl">
            Get a Clear SEO Fix List under 10 Minutes. Rank in Google and AI agents like ChatGPT, Gemini, and Claude.
            </p>
            <div className="mt-7 flex justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,22,57,0.16)] transition-transform duration-200 hover:scale-[1.05] md:text-base"
              >
                Get Your SEO Audit
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-xl bg-[#f4f6f7] px-6 py-3 text-sm font-bold text-[var(--primary)] transition-transform duration-200 hover:scale-[1.05] md:text-base"
              >
                See Sample Report
              </a>
            </div>
          <p className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-[var(--on-surface)]/70 md:text-base">
            <svg
              width="20"
              height="20"
              viewBox="0 0 100 100"
              aria-hidden="true"
              className="shrink-0"
            >
              <polygon
                points="50,2 63,12 80,8 84,24 98,34 90,50 98,66 84,76 80,92 63,88 50,98 37,88 20,92 16,76 2,66 10,50 2,34 16,24 20,8 37,12"
                fill="#16a34a"
              />
              <path
                d="M29 52 L43 66 L72 37"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Over 4,000+ audits delivered
            </p>
          </div>
        </section>

        <AuditPreviewSection />

        <section className="mt-14">
          <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
            How We Compare
          </h2>
          <p className="mt-3 text-center text-lg text-[var(--on-surface)]/70">
            The fastest, most actionable SEO audit on the market.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr_1fr]">
            <article className="min-h-[405px] rounded-2xl bg-[var(--surface-container-low)] p-7">
              <h3 className="font-manrope text-[24px] font-extrabold leading-tight text-[var(--primary)]">SEO Agencies</h3>
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--on-surface)]/45">
                Higher cost and slower delivery
              </p>
              <ul className="mt-6 space-y-4 text-[16px] text-[var(--on-surface)]/82">
                {[
                  "Expensive audits ($1,000+)",
                  "Longer delivery times (2-4 weeks)",
                  "Long onboarding flows",
                  "Reports may be complex",
                  "Frequently upsell services",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#b91c1c] text-xs font-black text-white">
                      ×
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="relative min-h-[405px] rounded-2xl border-[3px] border-[#22c55e] bg-[var(--primary)] p-7 text-white shadow-[0_14px_34px_rgba(0,22,57,0.2)]">
              <span className="absolute right-4 top-4 rounded-md bg-[#22c55e] px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--primary)]">
                Recommended
              </span>
              <h3 className="font-manrope text-[26px] font-extrabold leading-tight">TrafficLift</h3>
              <p className="mt-1 text-base font-bold uppercase tracking-wide text-[#22c55e]">
                Starting at $8.99
              </p>
              <ul className="mt-6 space-y-3 text-[16px] leading-snug">
                {[
                  "Audit delivered in under 24 hours",
                  "50+ ranking factors analyzed by AI trained on real search data",
                  "Prioritized fix list included",
                  "Step-by-step recommendations",
                  "Plain language explanations",
                  "No upsells",
                  "Created by SEO professionals with 15+ years experience",
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
                href="/dashboard"
                className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#22c55e] px-5 py-3 text-base font-black text-[var(--primary)] transition-transform duration-200 hover:scale-[1.05]"
              >
                Get My SEO Audit
              </Link>
            </article>

            <article className="min-h-[405px] rounded-2xl bg-[var(--surface-container-low)] p-7">
              <h3 className="font-manrope text-[24px] font-extrabold leading-tight text-[var(--primary)]">
                Professional SEO Tools
              </h3>
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--on-surface)]/45">
                Data-heavy, not action-focused
              </p>
              <ul className="mt-6 space-y-4 text-[16px] text-[var(--on-surface)]/82">
                {[
                  "Large amounts of raw data",
                  "Requires technical knowledge",
                  "No clear action plan",
                  "No human review",
                  "Subscription cost often $100+ monthly",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#b91c1c] text-xs font-black text-white">
                      ×
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
            Most Websites Lose Traffic Without Realizing It
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Neglecting Quick Wins",
                body: "Not using your keywords in essential page elements like title, meta title, and headings.",
                icon: <FilePenLine size={26} className="text-[#22c55e]" />,
                dark: true,
              },
              {
                title: "Technical Blind Spots",
                body: "Hidden crawling errors and indexing issues prevent Google from seeing your best content.",
                icon: <CircleAlert size={26} className="text-[#dc2626]" />,
                dark: false,
              },
              {
                title: "Slow Performance",
                body: "Page speed is more than just a number. We identify the exact scripts and assets killing your conversion rates.",
                icon: <GaugeCircle size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Weak Optimization",
                body: "Keywords are changing. If your on-page strategy is dated, you're invisible to modern AI search engines.",
                icon: <SearchX size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Content Quality Gaps",
                body: "Search engines prioritize E-E-A-T. We find the content that's hurting your domain authority.",
                icon: <FilePenLine size={26} className="text-[var(--primary)]" />,
                dark: false,
              },
              {
                title: "Not Optimized for LLMs",
                body: "Most sites are not optimized for modern AI agents like ChatGPT, Gemini, and Claude, making you invisible to AI search.",
                icon: <Bot size={26} className="text-[#22c55e]" />,
                dark: true,
              },
            ].map((item) => (
              <article
                key={item.title}
                className={`rounded-2xl p-7 ${item.dark ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--primary)]"}`}
              >
                {item.icon}
                <h3 className="mt-5 font-manrope text-[20px] font-extrabold leading-tight">
                  {item.title}
                </h3>
                <p className={`mt-4 text-[15px] leading-relaxed ${item.dark ? "text-white/85" : "text-[var(--on-surface)]/78"}`}>
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <AuditIncludesSection />

        <ProcessTimelineSection />

        <section id="pricing" className="mt-14">
          <h2 className="text-center font-manrope text-2xl font-extrabold md:text-3xl">Transparent Pricing</h2>
          <p className="mt-2 text-center text-sm text-[var(--on-surface)]/70">
            No hidden fees. Professional SEO accessible to everyone.
          </p>
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                name: "One-Time Audit",
                price: "$8.99",
                suffix: "/one-time",
                cta: "Select Basic",
                dark: false,
                perks: [
                  "One full audit of your submitted page",
                  "All audit elements included",
                  "Audits are stored permanently",
                ],
              },
              {
                name: "Starter Plan",
                price: "$19.99",
                suffix: "/mo",
                cta: "Select Starter",
                badge: "Popular",
                dark: true,
                perks: [
                  "3 audits included",
                  "Full audit of your submitted pages",
                  "All audit elements included",
                  "Audits are stored permanently",
                ],
              },
              {
                name: "Standard Plan",
                price: "$24",
                suffix: "/mo",
                cta: "Select Standard",
                dark: false,
                perks: [
                  "10 audits included",
                  "Full audit of your submitted pages",
                  "All audit elements included",
                  "Audits are stored permanently",
                ],
              },
              {
                name: "Pro Plan",
                price: "$49",
                suffix: "/mo",
                cta: "Select Pro",
                dark: false,
                perks: [
                  "30 audits included",
                  "Full audit of your submitted pages",
                  "All audit elements included",
                  "Audits are stored permanently",
                ],
              },
            ].map((plan) => (
              <article
                key={plan.name}
                className={`rounded-xl p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)] transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_18px_44px_rgba(0,22,57,0.16)] ${
                  plan.dark
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--surface-container-low)] text-[var(--on-surface)]"
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
                  <span className={`ml-1 text-2xl font-semibold ${plan.dark ? "text-white/70" : "text-[var(--on-surface)]/60"}`}>
                    {plan.suffix}
                  </span>
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
                  href="/dashboard/billing"
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-base font-black ${
                    plan.dark
                      ? "bg-[var(--tertiary-fixed)] text-[var(--primary)]"
                      : "bg-[var(--surface-container-lowest)] text-[var(--primary)]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <article className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
            <div className="flex justify-center md:justify-start">
              <div className="h-[156px] w-[156px] overflow-hidden rounded-full border-4 border-white shadow-[0_10px_24px_rgba(0,22,57,0.12)]">
                <Image
                  src="/alex-founder.png"
                  alt="Alex, Founder of TrafficLift"
                  width={156}
                  height={156}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <div>
              <h2 className="font-manrope text-xl font-extrabold tracking-tight text-[var(--primary)]">
                Making Professional SEO Accessible
              </h2>
              <p className="mt-3 max-w-5xl text-[17px] italic leading-relaxed text-[var(--on-surface)]/74 md:text-[18px]">
                &quot;After 12+ years at agencies and in-house teams, I saw how small businesses were being priced out of
                quality SEO. TrafficLift was born from the idea that everyone deserves a detailed audit that actually
                moves the needle.&quot;
              </p>
              <p className="mt-4 text-[16px] font-extrabold text-[var(--primary)] md:text-[18px]">
                — Alex, Founder of TrafficLift
              </p>
            </div>
          </article>
        </section>

        <section className="mt-14">
          <h2 className="text-center font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)] md:text-3xl">
            What Our Customers Say
          </h2>
          <p className="mt-2 text-center text-sm text-[var(--on-surface)]/70 md:text-base">
            Real feedback from teams improving SEO with clear, prioritized actions.
          </p>
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4">
              {[
                {
                  quote:
                    "We fixed title tags and internal links first, and saw a gradual increase in qualified traffic over the next month.",
                  name: "Mia, Ecommerce Manager",
                  photo: "https://i.pravatar.cc/120?img=32",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "The audit surfaced technical issues our team missed in previous checks, especially around indexing and crawl depth.",
                  name: "Daniel, Growth Lead",
                  photo: "https://i.pravatar.cc/120?img=12",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "I liked how the action plan was ranked by impact. It helped us focus instead of trying to fix everything at once.",
                  name: "Sophia, Startup Founder",
                  photo: "https://i.pravatar.cc/120?img=47",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "Compared to other tools, this gave us more practical analysis and fewer generic recommendations.",
                  name: "Ethan, Marketing Director",
                  photo: "https://i.pravatar.cc/120?img=15",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "The report was detailed but still easy to follow. Our content team could implement changes without extra meetings.",
                  name: "Olivia, Content Lead",
                  photo: "https://i.pravatar.cc/120?img=26",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "We didn't jump overnight, but we did improve impressions and click-through after applying the first 5 priorities.",
                  name: "Noah, SEO Specialist",
                  photo: "https://i.pravatar.cc/120?img=68",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "The backlink review gave us a clearer picture of where authority was leaking and what to fix first.",
                  name: "Lucas, Agency Owner",
                  photo: "https://i.pravatar.cc/120?img=60",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "This was the first audit where the recommendations felt tailored to our page instead of copied from a checklist.",
                  name: "Ava, Product Marketer",
                  photo: "https://i.pravatar.cc/120?img=5",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "We used the prioritized tasks as our 30-day roadmap. It made planning with engineering much easier.",
                  name: "Grace, Head of Marketing",
                  photo: "https://i.pravatar.cc/120?img=9",
                  linkedinUrl: "#",
                },
                {
                  quote:
                    "Great balance between AI speed and human validation. The final notes explained exactly why each fix mattered.",
                  name: "Leo, SaaS Founder",
                  photo: "https://i.pravatar.cc/120?img=53",
                  linkedinUrl: "#",
                },
              ].map((item) => (
                <article
                  key={item.name}
                  className="w-[320px] shrink-0 rounded-2xl bg-[var(--surface-container-lowest)] p-5 shadow-[0_10px_30px_rgba(0,22,57,0.06)]"
                >
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
              {
                q: "How long does the audit take?",
                a: "The audit is completed in under 24 hours, including the manual human review phase.",
              },
              {
                q: "Will you fix the issues?",
                a: "We identify and explain the issues found during the audit and provide clear recommendations on how to address them.",
              },
              {
                q: "What data do I need to provide?",
                a: "For an SEO audit, you only need to provide the URL of the page you want to increase traffic to and the keyword you want to rank for.",
              },
              {
                q: "How will I receive my audit?",
                a: "You will receive an email notification when your audit is ready. It will also be available in your TrafficLift user dashboard.",
              },
              {
                q: "Is my data secure?",
                a: "Yes. We treat your data as confidential and do not sell or share your audit data with third parties.",
              },
            ].map((item) => (
              <article
                key={item.q}
                className="rounded-2xl bg-[var(--surface-container-lowest)] px-6 py-7"
              >
                <h3 className="font-manrope text-lg font-extrabold leading-tight text-[var(--primary)] md:text-xl">
                  {item.q}
                </h3>
                <p className="mt-3 max-w-6xl text-base leading-relaxed text-[var(--on-surface)]/78">
                  {item.a}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-10 pb-8 text-center text-xs text-[var(--on-surface)]/55">
          © {new Date().getFullYear()} TrafficLift. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
