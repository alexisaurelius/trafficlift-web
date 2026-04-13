"use client";

import { useMemo, useState } from "react";
import { ChartNoAxesColumn, MousePointerClick, ShoppingCart, Users } from "lucide-react";

type AuditTab = "funnel" | "ux" | "checkout" | "trust";

type TabConfig = {
  id: AuditTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  topLeftTitle: string;
  topLeftBody: string;
  topLeftMeta: string;
  topRightTitle: string;
  topRightBody: string;
  progress: number;
  bottomLeftTitle: string;
  bottomLeftBody: string;
  bottomLeftMeta: string;
  bottomRightTitle: string;
  bottomRightBody: string;
};

const TABS: TabConfig[] = [
  {
    id: "funnel",
    label: "Funnel",
    icon: ChartNoAxesColumn,
    topLeftTitle: "FUNNEL LEAK ANALYSIS",
    topLeftBody: "Landing -> Pricing click-through drops by 42%",
    topLeftMeta: "high-impact leak",
    topRightTitle: "PRIMARY FRICTION",
    topRightBody: "Visitors fail to see value before the first CTA, reducing progression to sign-up.",
    progress: 64,
    bottomLeftTitle: "CTA CLARITY",
    bottomLeftBody: "Primary CTA appears late on smaller screens",
    bottomLeftMeta: "High impact issue",
    bottomRightTitle: "PATH HEALTH",
    bottomRightBody: "3 key pages need stronger progression cues",
  },
  {
    id: "ux",
    label: "UX",
    icon: MousePointerClick,
    topLeftTitle: "SCANNABILITY",
    topLeftBody: "Hero-value match is clear, but mid-page hierarchy can be tightened",
    topLeftMeta: "desktop + mobile",
    topRightTitle: "INTERACTION FRICTION",
    topRightBody: "Some users pause before form actions because guidance is not visible enough.",
    progress: 72,
    bottomLeftTitle: "FORM EXPERIENCE",
    bottomLeftBody: "Input helper text can reduce hesitation and drop-off",
    bottomLeftMeta: "Medium priority",
    bottomRightTitle: "READABILITY",
    bottomRightBody: "Simplify key blocks to lower cognitive load before checkout",
  },
  {
    id: "checkout",
    label: "Checkout",
    icon: ShoppingCart,
    topLeftTitle: "CHECKOUT FLOW",
    topLeftBody: "Payment intent starts strong but completion dips on plan comparison",
    topLeftMeta: "purchase stage",
    topRightTitle: "PRICING FRICTION",
    topRightBody: "Users need stronger differentiation between plans before selecting.",
    progress: 68,
    bottomLeftTitle: "OBJECTION HANDLING",
    bottomLeftBody: "Add trust and guarantee cues near billing actions",
    bottomLeftMeta: "Revenue lift opportunity",
    bottomRightTitle: "RECOVERY PATH",
    bottomRightBody: "Follow-up prompts can recover abandoned sessions",
  },
  {
    id: "trust",
    label: "Trust",
    icon: Users,
    topLeftTitle: "TRUST SIGNALS",
    topLeftBody: "Foundational social proof is present but could be surfaced earlier",
    topLeftMeta: "confidence profile",
    topRightTitle: "CREDIBILITY STRENGTH",
    topRightBody: "Testimonials work well; stronger proof near CTA blocks can improve action rates.",
    progress: 75,
    bottomLeftTitle: "AUTHORITY GAPS",
    bottomLeftBody: "Add quantitative outcomes near conversion points",
    bottomLeftMeta: "Quick win",
    bottomRightTitle: "TRUST IMPROVEMENTS",
    bottomRightBody: "Highlight guarantees and process transparency at key decision moments",
  },
];

const CHIP_SETS: Record<AuditTab, Array<{ label: string; tone: "red" | "gray" | "green" }>> = {
  funnel: [
    { label: "CTA appears late", tone: "red" },
    { label: "Value proof weak", tone: "gray" },
    { label: "Step leakage high", tone: "gray" },
    { label: "Path mapped", tone: "green" },
  ],
  ux: [
    { label: "Form hesitation", tone: "red" },
    { label: "Hierarchy uneven", tone: "gray" },
    { label: "Copy density high", tone: "gray" },
    { label: "Mobile stable", tone: "green" },
  ],
  checkout: [
    { label: "Plan confusion", tone: "red" },
    { label: "Objection gaps", tone: "gray" },
    { label: "Drop-off spike", tone: "gray" },
    { label: "Intent strong", tone: "green" },
  ],
  trust: [
    { label: "Proof timing late", tone: "red" },
    { label: "Outcomes not visible", tone: "gray" },
    { label: "Guarantees hidden", tone: "gray" },
    { label: "Reviews present", tone: "green" },
  ],
};

function chipClass(tone: "red" | "gray" | "green") {
  if (tone === "red") return "bg-red-50 text-red-600";
  if (tone === "green") return "bg-green-50 text-green-600";
  return "bg-zinc-100 text-zinc-600";
}

export function CroPreviewSection() {
  const [activeTab, setActiveTab] = useState<AuditTab>("funnel");
  const current = useMemo(() => TABS.find((tab) => tab.id === activeTab) ?? TABS[0], [activeTab]);
  const chips = CHIP_SETS[activeTab];

  return (
    <section id="how" className="mt-10">
      <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
        Inside Your AI CRO Audit Report
      </h2>
      <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-[var(--on-surface)]/70">
        See the conversion friction points we analyze to turn more visitors into paying customers.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[230px_minmax(0,1fr)] md:items-start">
        <aside className="space-y-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-14 w-full items-center gap-3 rounded-xl px-5 text-left text-lg font-semibold transition ${
                  active
                    ? "bg-[var(--primary)] text-white shadow-[0_8px_18px_rgba(0,22,57,0.22)]"
                    : "text-[var(--on-surface)]/80 hover:bg-[var(--surface-container-low)]"
                }`}
              >
                <Icon size={18} /> {tab.label}
              </button>
            );
          })}
        </aside>

        <div>
          <div className="rounded-2xl border border-[#0e3a82] bg-[#05245a] p-0 shadow-[0_16px_40px_rgba(0,22,57,0.18)]">
            <div className="flex items-center gap-2 rounded-t-2xl bg-[#0e2d66] px-6 py-4">
              <span className="h-3 w-3 rounded-full bg-[#ef4444]" />
              <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
              <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
              <p className="mx-auto text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Report View: {current.label} Optimization
              </p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#28bf66]">{current.topLeftTitle}</p>
                <div className="mt-2 rounded-lg bg-[#143f7f] px-3 py-3 text-sm font-semibold text-white/95">
                  {current.topLeftBody}
                </div>
                <p className="mt-2 text-[11px] text-white/50">{current.topLeftMeta}</p>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{current.topRightTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{current.topRightBody}</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/20">
                  <div className="h-1.5 rounded-full bg-[#22c55e]" style={{ width: `${current.progress}%` }} />
                </div>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{current.bottomLeftTitle}</p>
                <p className="mt-2 text-base italic text-white/85">{current.bottomLeftBody}</p>
                <p className="mt-2 text-[11px] text-red-300">{current.bottomLeftMeta}</p>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{current.bottomRightTitle}</p>
                <div className="mt-2 rounded-lg bg-[#143f7f] px-3 py-2 text-sm font-medium text-white/85">
                  {current.bottomRightBody}
                </div>
              </article>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <p className="max-w-[660px] text-[15px] leading-[1.5] text-[var(--on-surface)]/88 md:text-[16px] md:leading-[1.5]">
              We analyze your complete conversion path to identify friction points that suppress sign-ups and purchases.
            </p>
            <div className="grid grid-cols-2 gap-3 md:justify-self-end md:pt-0.5">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap ${chipClass(chip.tone)}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
