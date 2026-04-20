"use client";

import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { FileText, Gauge, Layers3, Settings, ShieldCheck } from "lucide-react";
import { formatKeywordCandidatesForDisplay, parseKeywordCandidates } from "@/lib/keyword-match";
import type { AuditType } from "@/lib/audit-mode";

type CheckItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  details: string | null;
  recommendation: string | null;
};

function buildPlainWhy(
  check: Pick<CheckItem, "key" | "details" | "recommendation" | "status">,
  keywordPhrase: string,
  keywordCount: number,
  auditType: AuditType,
) {
  const details = check.details ?? "";
  const titleMatch = details.match(/Current title:\s*"([^"]+)"/i);
  const h1Match = details.match(/Current H1:\s*"([^"]+)"/i);
  const psMatch = details.match(/PageSpeed score:\s*(\d+)/i);
  const keywordLabel = keywordCount > 1 ? "keywords" : "keyword";
  const missingVerb = keywordCount > 1 ? "are" : "is";
  const detailsSummary = details
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (auditType === "cro") {
    if (details) {
      return details.replace(/\s+/g, " ").trim();
    }
    return check.recommendation ?? "This item affects conversion performance and should be reviewed.";
  }

  if (check.status === "skipped") {
    return check.details ?? "This check was not run (integration unavailable or not configured).";
  }

  switch (check.key) {
    case "title-tag":
      return titleMatch
        ? `The title is a strong relevance signal. Current title "${titleMatch[1]}" is evaluated against your target stems/phrases (not only exact-match).`
        : `The title should reflect the target topic so search engines can map the page to that intent.`;
    case "h1-count": {
      const variantYes = /Semantic\/variant match in H1:\s*yes/i.test(details);
      if (h1Match && variantYes) {
        return `The H1 "${h1Match[1]}" matches your target topic (semantic / variant match), which supports topical clarity.`;
      }
      return h1Match
        ? `The H1 "${h1Match[1]}" may not align with every exact quoted target phrase; compare against your keyword list in the details below.`
        : `A missing or misaligned H1 weakens topical clarity for the target ${keywordLabel} ${keywordPhrase}.`;
    }
    case "meta-description":
      return `Your meta description is used as search snippet context. If ${keywordPhrase} ${missingVerb} missing, relevance and click-through can drop for that query.`;
    case "h2-keyword":
      return `At least one H2 containing ${keywordPhrase} helps reinforce topical relevance throughout the page structure.`;
    case "heading-hierarchy": {
      return "Heading order is evaluated in primary content (main or outside nav/footer), not in the global document order.";
    }
    case "pagespeed":
      if (psMatch) {
        const score = Number(psMatch[1]);
        return `Speed directly affects user drop-off and ranking signals. Current PageSpeed score is ${score}, which indicates optimization is still needed.`;
      }
      return "PageSpeed was not run for this report (API not configured), so this is not a measured performance verdict for the page.";
    case "structured-data":
      return "Broken or missing structured data can prevent rich result eligibility and reduce SERP visibility.";
    case "schema-coverage":
      return "Schema coverage affects how clearly search engines understand entities and rich result opportunities.";
    case "canonical":
      return "Canonical tags tell search engines which URL version to index. Incorrect canonical setup can split ranking signals.";
    case "hreflang":
      return "Hreflang helps Google serve the right language/region version. Inconsistency can confuse international indexing.";
    case "sitemap":
      return "If key URLs are missing from sitemap coverage, crawling and indexing priority can be weaker.";
    case "robots":
      return "robots.txt controls crawl access. Incorrect directives can block or weaken discovery of important pages.";
    default:
      if (check.status === "pass") {
        return detailsSummary || "This item passed based on the measured audit signals for this page.";
      }
      if (detailsSummary) {
        return `This item failed based on page evidence: ${detailsSummary}`;
      }
      return check.recommendation ?? "This item needs improvement based on the current page audit signals.";
  }
}

type TopicConfig = {
  id: string;
  label: string;
  keys: string[];
  icon: ComponentType<{ size?: number; className?: string }>;
};

const TOPICS: TopicConfig[] = [
  {
    id: "all-suggestions",
    label: "All Suggestions",
    keys: [],
    icon: Layers3,
  },
  {
    id: "on-page",
    label: "On-Page",
    keys: [
      "title-tag",
      "meta-description",
      "h1-count",
      "h2-keyword",
      "heading-hierarchy",
      "alt-text",
      "internal-linking",
    ],
    icon: FileText,
  },
  {
    id: "technical",
    label: "Technical",
    keys: [
      "structured-data",
      "schema-coverage",
      "indexability-controls",
      "http-status-chain",
      "canonical",
      "canonical-consistency",
      "hreflang",
      "sitemap",
      "duplicate-metadata",
      "robots",
      "robots-ai-policy",
      "safe-browsing",
      "social-tags",
      "twitter-card-coverage",
      "internal-links-health",
    ],
    icon: Settings,
  },
  {
    id: "performance",
    label: "Performance",
    keys: [
      "pagespeed",
      "image-performance",
      "render-blocking-resources",
      "asset-caching-compression",
      "third-party-script-weight",
    ],
    icon: Gauge,
  },
];

const CRO_TOPICS: TopicConfig[] = [
  {
    id: "all-suggestions",
    label: "All Suggestions",
    keys: [],
    icon: Layers3,
  },
  {
    id: "funnel",
    label: "Funnel",
    keys: [
      "hero-clarity",
      "hero-dual-cta",
      "pricing-comparison-clarity",
      "footer-cta-clarity",
    ],
    icon: FileText,
  },
  {
    id: "trust",
    label: "Trust",
    keys: [
      "support-objections",
      "quantified-outcomes",
      "faq-depth",
    ],
    icon: ShieldCheck,
  },
  {
    id: "technical",
    label: "Technical",
    keys: [
      "technical-health",
      "analytics-tracking",
    ],
    icon: Settings,
  },
];

function priorityWeight(priority: string) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function suggestionSort(a: CheckItem, b: CheckItem) {
  const rank = (status: string) => {
    if (status === "fail") return 0;
    if (status === "warn") return 1;
    if (status === "skipped") return 2;
    if (status === "pass") return 3;
    return 4;
  };
  const statusDiff = rank(a.status) - rank(b.status);
  if (statusDiff !== 0) return statusDiff;

  const priorityDiff = priorityWeight(a.priority) - priorityWeight(b.priority);
  if (priorityDiff !== 0) return priorityDiff;
  return 0;
}

function priorityPill(priority: string) {
  if (priority === "critical") return "bg-rose-100 text-rose-700";
  if (priority === "high") return "bg-amber-100 text-amber-700";
  if (priority === "medium") return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-700";
}

function statusPill(status: string) {
  if (status === "fail") return "bg-rose-50 text-rose-700";
  if (status === "warn") return "bg-amber-100 text-amber-800";
  if (status === "skipped") return "bg-slate-100 text-slate-700";
  return "bg-emerald-50 text-emerald-700";
}

function sectionStyle(section: "critical" | "high" | "medium" | "low" | "skipped" | "pass") {
  if (section === "critical") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-rose-700",
      item: "rounded-lg border border-rose-200 bg-white px-3 py-2",
    };
  }
  if (section === "high") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-amber-700",
      item: "rounded-lg border border-amber-200 bg-white px-3 py-2",
    };
  }
  if (section === "medium") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-sky-700",
      item: "rounded-lg border border-sky-200 bg-white px-3 py-2",
    };
  }
  if (section === "low") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-slate-700",
      item: "rounded-lg border border-slate-200 bg-white px-3 py-2",
    };
  }
  if (section === "pass") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-emerald-700",
      item: "rounded-lg border border-emerald-200 bg-white px-3 py-2",
    };
  }
  if (section === "skipped") {
    return {
      wrapper: "",
      title: "font-manrope text-base font-extrabold text-slate-600",
      item: "rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2",
    };
  }
  return {
    wrapper: "",
    title: "font-manrope text-base font-extrabold text-emerald-700",
    item: "rounded-lg border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-white px-3 py-2",
  };
}

function formatDetails(details: string | null) {
  return details ?? "No details captured.";
}

export function AuditTopicPanel({
  checks,
  targetKeyword,
  auditType = "seo",
}: {
  checks: CheckItem[];
  targetKeyword: string;
  auditType?: AuditType;
}) {
  const [activeTopic, setActiveTopic] = useState("all-suggestions");
  const keywordCandidates = parseKeywordCandidates(targetKeyword);
  const resolvedKeywordCandidates = keywordCandidates.length > 0 ? keywordCandidates : [targetKeyword];
  const keywordPhrase = formatKeywordCandidatesForDisplay(
    resolvedKeywordCandidates,
  );
  const normalizedChecks = useMemo(
    () =>
      checks.map((check) => {
        if (check.key === "structured-data" && check.priority === "critical") {
          return { ...check, priority: "high" };
        }
        if (check.key === "asset-caching-compression" && check.priority === "high") {
          return { ...check, priority: "medium" };
        }
        return check;
      }),
    [checks],
  );

  const checksByTopic = useMemo(() => {
    const topicSet = auditType === "cro" ? CRO_TOPICS : TOPICS;
    return topicSet.reduce<Record<string, CheckItem[]>>((acc, topic) => {
      if (topic.id === "all-suggestions") {
        acc[topic.id] = [...normalizedChecks].sort(suggestionSort);
        return acc;
      }

      const scoped = normalizedChecks.filter((check) => topic.keys.includes(check.key));
      acc[topic.id] = [...scoped].sort(suggestionSort);
      return acc;
    }, {});
  }, [normalizedChecks, auditType]);

  const topicSet = auditType === "cro" ? CRO_TOPICS : TOPICS;
  const currentTopic = topicSet.find((topic) => topic.id === activeTopic) ?? topicSet[0];
  const currentChecks = checksByTopic[currentTopic.id] ?? [];
  const criticalItems = currentChecks.filter(
    (check) => check.priority === "critical" && check.status !== "pass" && check.status !== "skipped",
  );
  const highItems = currentChecks.filter(
    (check) => check.priority === "high" && check.status !== "pass" && check.status !== "skipped",
  );
  const mediumItems = currentChecks.filter(
    (check) => check.priority === "medium" && check.status !== "pass" && check.status !== "skipped",
  );
  const lowItems = currentChecks.filter(
    (check) => check.priority === "low" && check.status !== "pass" && check.status !== "skipped",
  );
  const skippedItems = currentChecks.filter((check) => check.status === "skipped");
  const passItems = currentChecks.filter((check) => check.status === "pass");

  const sections: Array<{
    id: "critical" | "high" | "medium" | "low" | "skipped" | "pass";
    title: string;
    items: CheckItem[];
  }> = [
    { id: "critical", title: "Critical (Action Required Now)", items: criticalItems },
    { id: "high", title: "High Impact (Action Required Soon)", items: highItems },
    { id: "medium", title: "Medium Impact (Address When Possible)", items: mediumItems },
    { id: "low", title: "Low Impact (Fix Later)", items: lowItems },
    { id: "skipped", title: "Not Measured (Integration)", items: skippedItems },
    { id: "pass", title: "Passed Items (No Action Needed)", items: passItems },
  ];
  const visibleSections = sections.filter((section) => section.items.length > 0);

  return (
    <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,760px)] lg:items-start lg:justify-start">
      <aside className="space-y-3">
        {topicSet.map((topic) => {
          const Icon = topic.icon;
          const active = topic.id === activeTopic;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => setActiveTopic(topic.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left font-manrope text-lg font-extrabold transition ${
                active
                  ? "bg-[var(--primary)] text-white shadow-[0_14px_26px_rgba(0,22,57,0.2)]"
                  : "bg-transparent text-[var(--on-surface)]/80 hover:bg-[var(--surface-container-low)]"
              }`}
            >
              <Icon size={20} className={active ? "text-white" : "text-[var(--on-surface)]/70"} />
              <span>{topic.label}</span>
            </button>
          );
        })}
      </aside>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <div className="space-y-4">
          {visibleSections.length === 0 ? (
            <p className="text-sm text-[var(--on-surface)]/66">No items for this filter.</p>
          ) : (
            visibleSections.map((section) => {
              const style = sectionStyle(section.id);
              const sortedItems = [...section.items].sort(suggestionSort);
              return (
                <div key={section.id} className={style.wrapper}>
                  <h3 className={style.title}>{section.title}</h3>
                  <ul className="mt-3 space-y-2">
                    {sortedItems.map((item) => (
                      <li
                        key={item.id}
                        className={`${style.item} ${
                          item.status === "pass" ? "bg-emerald-50/40" : item.status === "skipped" ? "bg-slate-50/90" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityPill(item.priority)}`}
                          >
                            {item.priority}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusPill(item.status)}`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--on-surface)]/74">
                          <span className="font-semibold">
                            {item.status === "pass" ? "Recommendation:" : item.status === "skipped" ? "Note:" : "Fix:"}
                          </span>{" "}
                          {item.recommendation ?? "No recommendation provided."}
                        </p>
                        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
                          <span className="font-semibold">Why:</span>{" "}
                          {buildPlainWhy(item, keywordPhrase, resolvedKeywordCandidates.length, auditType)}
                        </p>
                        {auditType === "seo" ? (
                          <p className="mt-1 whitespace-pre-line text-sm text-[var(--on-surface)]/70">
                            {formatDetails(item.details)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </article>
    </section>
  );
}
