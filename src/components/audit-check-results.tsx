"use client";

import { useMemo, useState } from "react";

type Category = "On-Page" | "Technical" | "Performance" | "Authority" | "Other";

const CATEGORY_ORDER: Category[] = ["On-Page", "Technical", "Performance", "Authority", "Other"];

const CATEGORY_KEY_MAP: Record<Category, string[]> = {
  "On-Page": [
    "title-tag",
    "meta-description",
    "meta-redundancy",
    "h1-count",
    "h2-keyword",
    "heading-hierarchy",
    "keyword-usage",
    "alt-text",
    "internal-linking",
    "hero-clarity",
    "hero-dual-cta",
    "cta-microcopy-reassurance",
    "quantified-outcomes",
    "cta-audit",
    "pricing-comparison-clarity",
    "footer-cta-clarity",
  ],
  Technical: [
    "structured-data",
    "schema-coverage",
    "indexability-controls",
    "http-status-chain",
    "canonical",
    "canonical-consistency",
    "hreflang",
    "sitemap",
    "sitemap-depth",
    "duplicate-metadata",
    "robots",
    "robots-ai-policy",
    "safe-browsing",
    "social-tags",
    "twitter-card-coverage",
    "internal-links-health",
    "technical-health",
    "analytics-tracking",
    "language-consistency",
  ],
  Performance: [
    "pagespeed",
    "image-performance",
    "render-blocking-resources",
    "asset-caching-compression",
    "third-party-script-weight",
  ],
  Authority: [
    "site-architecture",
    "eeat-signals",
    "author-credibility",
    "support-objections",
    "faq-depth",
  ],
  Other: [],
};

type CheckItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  details: string | null;
  recommendation: string | null;
};

const TERM_HELP_BY_KEY: Record<string, string> = {
  hreflang: "Hreflang tells Google which language/region version of a page should be shown to users.",
  canonical: "Canonical URL tells search engines which page version is the primary one to index.",
  "canonical-consistency": "Checks whether canonical tags match the page URL and site structure consistently.",
  "eeat-signals":
    "E-E-A-T means Experience, Expertise, Authoritativeness, and Trustworthiness signals on your site.",
  "schema-coverage": "Schema markup is structured data that helps search engines understand your page content.",
  "structured-data": "Structured data (JSON-LD) enables enhanced search results like FAQs and rich snippets.",
  "indexability-controls": "Checks noindex/nofollow directives from meta robots and response headers.",
  "http-status-chain": "Tracks redirect hops and final HTTP status for the audited URL.",
  pagespeed: "Core Web Vitals measure real loading and interaction speed (LCP, CLS, INP).",
  robots: "robots.txt controls which parts of your site search engines can crawl.",
  "robots-ai-policy": "Defines whether AI crawlers are allowed or blocked from your content.",
  "safe-browsing": "Google Safe Browsing flags potential malware or phishing risks.",
  "twitter-card-coverage": "Twitter card tags control how your page looks when shared on social media.",
  "social-tags": "Open Graph tags control page title/description/image previews on social platforms.",
  "internal-links-health": "Checks whether linked internal pages return healthy statuses.",
  "duplicate-metadata": "Detects duplicate title/description patterns across sampled site pages.",
  "render-blocking-resources": "Flags blocking CSS/JS in <head> that can delay first paint and interactivity.",
  "asset-caching-compression": "Checks whether core JS/CSS assets are cached and compressed.",
  "third-party-script-weight": "Tracks external script volume and vendor domains that increase page weight.",
};

function getCategoryByKey(key: string): Category {
  for (const [category, keys] of Object.entries(CATEGORY_KEY_MAP) as Array<[Category, string[]]>) {
    if (keys.includes(key)) {
      return category;
    }
  }
  return "Other";
}

function groupByCategory(checks: CheckItem[]) {
  const grouped = new Map<Category, CheckItem[]>();
  checks.forEach((check) => {
    const category = getCategoryByKey(check.key);
    const list = grouped.get(category) ?? [];
    list.push(check);
    grouped.set(category, list);
  });

  return CATEGORY_ORDER.map((category) => [category, grouped.get(category) ?? []] as const).filter(
    ([, list]) => list.length > 0,
  );
}

function statusPill(status: string) {
  if (status === "pass") return "bg-emerald-50 text-emerald-700";
  if (status === "warn") return "bg-amber-100 text-amber-800";
  return "bg-rose-50 text-rose-700";
}

function priorityPill(priority: string) {
  if (priority === "critical") return "bg-rose-100 text-rose-700";
  if (priority === "high") return "bg-amber-100 text-amber-700";
  if (priority === "medium") return "bg-sky-100 text-sky-700";
  return "bg-[var(--surface-container-low)] text-[var(--on-surface)]/80";
}

function formatDetails(details: string | null) {
  const value = details ?? "No details provided.";
  return value.replace(/\. +(?=\S)/g, ".\n");
}

export function AuditCheckResults({ checks }: { checks: CheckItem[] }) {
  const counts = useMemo(
    () => ({
      all: checks.length,
      fail: checks.filter((check) => check.status === "fail").length,
      pass: checks.filter((check) => check.status === "pass").length,
    }),
    [checks],
  );

  const [activeStatus, setActiveStatus] = useState<"all" | "fail" | "pass">("all");

  const filteredChecks = useMemo(
    () => (activeStatus === "all" ? checks : checks.filter((check) => check.status === activeStatus)),
    [checks, activeStatus],
  );

  const grouped = useMemo(() => groupByCategory(filteredChecks), [filteredChecks]);

  const filterBtnClass = (status: "all" | "fail" | "pass") => {
    const base = "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition";
    if (status === activeStatus) {
      if (status === "all") return `${base} bg-[var(--primary)] text-white`;
      if (status === "fail") return `${base} bg-rose-200 text-rose-800`;
      return `${base} bg-emerald-200 text-emerald-800`;
    }
    if (status === "all") return `${base} bg-[var(--surface-container-low)] text-[var(--on-surface)]/75 hover:bg-[var(--surface-container)]`;
    if (status === "fail") return `${base} bg-rose-50 text-rose-700 hover:bg-rose-100`;
    return `${base} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`;
  };

  return (
    <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
      <h2 className="font-manrope text-xl font-extrabold">Check Results</h2>
      <p className="mt-1 text-sm text-[var(--on-surface)]/70">
        Full breakdown of all checks. Use the filter to focus on fails or passes.
      </p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Filter by status</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveStatus("all")} className={filterBtnClass("all")}>
          {counts.all} All
        </button>
        <button type="button" onClick={() => setActiveStatus("fail")} className={filterBtnClass("fail")}>
          {counts.fail} Fails
        </button>
        <button type="button" onClick={() => setActiveStatus("pass")} className={filterBtnClass("pass")}>
          {counts.pass} Passes
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--on-surface)]/70">No checks found for this status.</p>
        ) : (
          grouped.map(([category, categoryChecks]) => (
            <section key={category} className="space-y-2">
              <h3 className="font-manrope text-base font-extrabold text-[var(--primary)]">{category}</h3>
              <div className="space-y-3">
                {categoryChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_6%,white)] p-4 ${
                      check.status === "pass" ? "bg-emerald-50/40" : "bg-[var(--surface)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusPill(check.status)}`}
                      >
                        {check.status}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityPill(check.priority)}`}
                      >
                        {check.priority}
                      </span>
                    </div>
                    <h4 className="mt-2 font-semibold">{check.title}</h4>
                    {TERM_HELP_BY_KEY[check.key] ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--on-surface)]/60" title={TERM_HELP_BY_KEY[check.key]}>
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-container-low)] text-[10px] font-bold">
                          i
                        </span>
                        {TERM_HELP_BY_KEY[check.key]}
                      </p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-line text-sm text-[var(--on-surface)]/75">
                      {formatDetails(check.details)}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--primary)]">
                      {check.recommendation ?? "No recommendation provided."}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}
