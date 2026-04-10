"use client";

import { useMemo, useState } from "react";
import { Cog, FileText, KeyRound, Link2, Swords } from "lucide-react";

type AuditTab = "on-page" | "keywords" | "backlinks" | "technical" | "competitors";

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
    id: "keywords",
    label: "Keywords",
    icon: KeyRound,
    topLeftTitle: "PRIMARY KEYWORD",
    topLeftBody: "seo audit report",
    topLeftMeta: "density: 0.8%",
    topRightTitle: "SECONDARY KEYWORDS",
    topRightBody:
      "technical seo audit, on-page audit, keyword visibility, search ranking fixes.",
    progress: 64,
    bottomLeftTitle: "INTENT MATCH",
    bottomLeftBody: "Search intent partially aligned with page copy",
    bottomLeftMeta: "Optimization needed",
    bottomRightTitle: "CONTENT DEPTH",
    bottomRightBody: "1,120 words analyzed",
  },
  {
    id: "backlinks",
    label: "Backlinks",
    icon: Link2,
    topLeftTitle: "REFERRING DOMAINS",
    topLeftBody: "24 active referring domains",
    topLeftMeta: "quality: mixed",
    topRightTitle: "ANCHOR DISTRIBUTION",
    topRightBody:
      "Branded anchors dominate. Commercial intent anchors remain underutilized for target terms.",
    progress: 58,
    bottomLeftTitle: "TOXICITY SIGNAL",
    bottomLeftBody: "No critical toxic links found",
    bottomLeftMeta: "Low risk",
    bottomRightTitle: "LINK GAPS",
    bottomRightBody: "12 competitor links not acquired",
  },
  {
    id: "technical",
    label: "Technical",
    icon: Cog,
    topLeftTitle: "CORE WEB VITALS",
    topLeftBody: "LCP: 2.8s • CLS: 0.07 • INP: 230ms",
    topLeftMeta: "mobile profile",
    topRightTitle: "CRAWL READINESS",
    topRightBody:
      "Sitemap detected, robots directives valid, but one canonical mismatch needs correction.",
    progress: 71,
    bottomLeftTitle: "STRUCTURED DATA",
    bottomLeftBody: "1 JSON-LD block invalid",
    bottomLeftMeta: "Critical fix",
    bottomRightTitle: "INDEXING STATUS",
    bottomRightBody: "8 pages indexable, 2 blocked intentionally",
  },
  {
    id: "competitors",
    label: "Competitors",
    icon: Swords,
    topLeftTitle: "SERP POSITION",
    topLeftBody: "Current average rank: 19",
    topLeftMeta: "target keyword set",
    topRightTitle: "COMPETITOR EDGE",
    topRightBody:
      "Top ranking pages have deeper topic clusters and stronger backlink velocity in the last 30 days.",
    progress: 46,
    bottomLeftTitle: "CONTENT GAP",
    bottomLeftBody: "Missing 3 high-intent supporting sections",
    bottomLeftMeta: "Opportunity",
    bottomRightTitle: "AUTHORITY GAP",
    bottomRightBody: "Domain authority lag vs top 3 competitors",
  },
];

const CHIP_SETS: Record<AuditTab, Array<{ label: string; tone: "red" | "gray" | "green" }>> = {
  "on-page": [
    { label: "Missing H1 tag", tone: "red" },
    { label: "Title too long", tone: "gray" },
    { label: "Image alt missing", tone: "gray" },
    { label: "Schema valid", tone: "green" },
  ],
  keywords: [
    { label: "Intent mismatch", tone: "red" },
    { label: "Keyword spread low", tone: "gray" },
    { label: "Cannibalization risk", tone: "gray" },
    { label: "Primary mapped", tone: "green" },
  ],
  backlinks: [
    { label: "Anchor imbalance", tone: "red" },
    { label: "Low DR links", tone: "gray" },
    { label: "Gap opportunities", tone: "gray" },
    { label: "Toxicity low", tone: "green" },
  ],
  technical: [
    { label: "JSON-LD invalid", tone: "red" },
    { label: "LCP needs work", tone: "gray" },
    { label: "Canonical mismatch", tone: "gray" },
    { label: "Robots valid", tone: "green" },
  ],
  competitors: [
    { label: "Authority gap", tone: "red" },
    { label: "Content depth low", tone: "gray" },
    { label: "Backlink lag", tone: "gray" },
    { label: "Gap map ready", tone: "green" },
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
    <section id="how" className="mt-16">
      <h2 className="text-center font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
        Inside Your SEO Audit Report
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
