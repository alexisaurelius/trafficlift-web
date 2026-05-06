"use client";

import { useMemo, useState } from "react";
import { Cog, FileText, ShieldCheck } from "lucide-react";

type AuditTab = "on-page" | "technical-perf" | "authority";

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
    id: "on-page",
    label: "On-Page",
    icon: FileText,
    topLeftTitle: "TITLE TAG ANALYSIS",
    topLeftBody: "Ledger AI | Best SEO Audit Tool for Modern Teams",
    topLeftMeta: "52 characters",
    topRightTitle: "META DESCRIPTION",
    topRightBody:
      "Stop losing revenue to technical SEO errors. Our AI-driven audits provide clear, actionable checklists to help your site rank higher.",
    progress: 78,
    bottomLeftTitle: "H1 / HEADINGS",
    bottomLeftBody: "No H1 tag detected on page",
    bottomLeftMeta: "High impact issue",
    bottomRightTitle: "URL STRUCTURE",
    bottomRightBody: "/services/seo-audit-report",
  },
  {
    id: "technical-perf",
    label: "Technical & Performance",
    icon: Cog,
    topLeftTitle: "CORE WEB VITALS",
    topLeftBody: "LCP: 2.3s • CLS: 0.06 • INP: 205ms",
    topLeftMeta: "technical + performance snapshot",
    topRightTitle: "CRAWL + RENDER READINESS",
    topRightBody:
      "Sitemap and robots are valid, but canonical consistency plus render-heavy assets still need cleanup.",
    progress: 74,
    bottomLeftTitle: "STRUCTURED DATA + IMAGES",
    bottomLeftBody: "1 JSON-LD block invalid and several below-fold assets remain uncompressed",
    bottomLeftMeta: "Critical + medium fixes",
    bottomRightTitle: "INDEXING + LOAD IMPROVEMENTS",
    bottomRightBody: "Fix schema/canonical signals, then preload key visuals and lazy-load non-critical media",
  },
  {
    id: "authority",
    label: "Authority",
    icon: ShieldCheck,
    topLeftTitle: "E-E-A-T SIGNALS",
    topLeftBody: "Strong attorney profiles and case-result credibility blocks detected",
    topLeftMeta: "trust profile",
    topRightTitle: "AUTHOR CREDIBILITY",
    topRightBody:
      "Named legal experts, leadership details, and transparent firm identity improve trust and topical authority.",
    progress: 74,
    bottomLeftTitle: "REPUTATION SIGNALS",
    bottomLeftBody: "Industry awards and recognition sections are present",
    bottomLeftMeta: "High confidence",
    bottomRightTitle: "AUTHORITY IMPROVEMENTS",
    bottomRightBody: "Add more first-party proof blocks and client outcome context on key pages",
  },
];

const CHIP_SETS: Record<AuditTab, Array<{ label: string; tone: "red" | "gray" | "green" }>> = {
  "on-page": [
    { label: "Missing H1 tag", tone: "red" },
    { label: "Title too long", tone: "gray" },
    { label: "Image alt missing", tone: "gray" },
    { label: "Schema valid", tone: "green" },
  ],
  "technical-perf": [
    { label: "JSON-LD invalid", tone: "red" },
    { label: "LCP needs work", tone: "gray" },
    { label: "Canonical mismatch", tone: "gray" },
    { label: "Robots valid", tone: "green" },
    { label: "Image payload high", tone: "red" },
    { label: "Preload tuning", tone: "gray" },
  ],
  authority: [
    { label: "Trust signals mixed", tone: "red" },
    { label: "Author bios partial", tone: "gray" },
    { label: "Proof blocks improve", tone: "gray" },
    { label: "Firm authority strong", tone: "green" },
  ],
};

function chipClass(tone: "red" | "gray" | "green") {
  if (tone === "red") return "bg-red-50 text-red-600";
  if (tone === "green") return "bg-green-50 text-green-600";
  return "bg-zinc-100 text-zinc-600";
}

export function AuditPreviewSection() {
  const [activeTab, setActiveTab] = useState<AuditTab>("on-page");
  const current = useMemo(() => TABS.find((tab) => tab.id === activeTab) ?? TABS[0], [activeTab]);
  const chips = CHIP_SETS[activeTab];

  return (
    <section id="how" className="mt-10">
      <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
        Inside Your AI SEO Audit Report
      </h2>
      <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-[var(--on-surface)]/70">
        Peek into the granular data we analyze to build your custom growth roadmap.
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#28bf66]">
                  {current.topLeftTitle}
                </p>
                <div className="mt-2 rounded-lg bg-[#143f7f] px-3 py-3 text-sm font-semibold text-white/95">
                  {current.topLeftBody}
                </div>
                <p className="mt-2 text-[11px] text-white/50">{current.topLeftMeta}</p>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
                  {current.topRightTitle}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{current.topRightBody}</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/20">
                  <div
                    className="h-1.5 rounded-full bg-[#22c55e]"
                    style={{ width: `${current.progress}%` }}
                  />
                </div>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
                  {current.bottomLeftTitle}
                </p>
                <p className="mt-2 text-base italic text-white/85">{current.bottomLeftBody}</p>
                <p className="mt-2 text-[11px] text-red-300">{current.bottomLeftMeta}</p>
              </article>

              <article className="rounded-xl bg-[#0f356f] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
                  {current.bottomRightTitle}
                </p>
                <div className="mt-2 rounded-lg bg-[#143f7f] px-3 py-2 text-sm font-medium text-white/85">
                  {current.bottomRightBody}
                </div>
              </article>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <p className="max-w-[660px] text-[15px] leading-[1.5] text-[var(--on-surface)]/88 md:text-[16px] md:leading-[1.5]">
              We scan your core page elements to find technical and structural issues that affect rankings and visibility.
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
