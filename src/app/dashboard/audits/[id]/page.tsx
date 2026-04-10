import Link from "next/link";
import { notFound } from "next/navigation";
import { load } from "cheerio";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { ReportMarkdownPanel } from "@/components/report-markdown-panel";
import { AuditCheckResults } from "@/components/audit-check-results";
import { AuditTopicPanel } from "@/components/audit-topic-panel";

type Category = "On-Page" | "Technical" | "Off-Page" | "Speed" | "Other";

const CATEGORY_ORDER: Category[] = ["On-Page", "Technical", "Off-Page", "Speed", "Other"];

const CATEGORY_KEY_MAP: Record<Category, string[]> = {
  "On-Page": [
    "title-tag",
    "meta-description",
    "meta-redundancy",
    "h1-count",
    "heading-hierarchy",
    "keyword-usage",
    "alt-text",
    "internal-linking",
    "internal-link-quality",
  ],
  Technical: [
    "structured-data",
    "schema-coverage",
    "canonical",
    "canonical-consistency",
    "hreflang",
    "hreflang-consistency",
    "sitemap",
    "sitemap-depth",
    "robots",
    "robots-ai-policy",
    "social-tags",
    "twitter-card-coverage",
  ],
  "Off-Page": ["eeat-signals", "author-credibility", "backlink-footprint", "site-architecture"],
  Speed: ["pagespeed", "image-performance"],
  Other: [],
};

function getCategoryByKey(key: string): Category {
  for (const [category, keys] of Object.entries(CATEGORY_KEY_MAP) as Array<[Category, string[]]>) {
    if (keys.includes(key)) {
      return category;
    }
  }
  return "Other";
}

function groupByCategory<T extends { key: string }>(checks: T[]) {
  const grouped = new Map<Category, T[]>();
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

function planSectionStyle(priority: string) {
  if (priority === "critical") {
    return {
      wrapper:
        "rounded-xl border border-rose-200 bg-rose-50/45 p-4",
      title: "font-manrope text-base font-extrabold text-rose-700",
      item: "rounded-lg border border-rose-200 bg-white px-3 py-2",
    };
  }
  if (priority === "high") {
    return {
      wrapper:
        "rounded-xl border border-amber-200 bg-amber-50/45 p-4",
      title: "font-manrope text-base font-extrabold text-amber-700",
      item: "rounded-lg border border-amber-200 bg-white px-3 py-2",
    };
  }
  if (priority === "medium") {
    return {
      wrapper:
        "rounded-xl border border-sky-200 bg-sky-50/45 p-4",
      title: "font-manrope text-base font-extrabold text-sky-700",
      item: "rounded-lg border border-sky-200 bg-white px-3 py-2",
    };
  }
  return {
    wrapper:
      "rounded-xl border border-emerald-200 bg-emerald-50/45 p-4",
    title: "font-manrope text-base font-extrabold text-emerald-700",
    item: "rounded-lg border border-emerald-200 bg-white px-3 py-2",
  };
}

function getScoreContext(score: number) {
  if (score >= 85) return { label: "Excellent", note: "Strong SEO baseline with minor refinements needed." };
  if (score >= 70) return { label: "Good", note: "Good performance, but important opportunities remain." };
  if (score >= 55) return { label: "Needs Work", note: "Several issues are likely limiting rankings." };
  return { label: "Weak", note: "Major SEO issues are likely suppressing visibility." };
}

function buildPlainWhy(check: { key: string; details?: string | null; status?: string }, keyword: string) {
  const details = check.details ?? "";
  const titleMatch = details.match(/Current title:\s*"([^"]+)"/i);
  const h1Match = details.match(/Current H1:\s*"([^"]+)"/i);
  const psMatch = details.match(/PageSpeed score:\s*(\d+)/i);

  switch (check.key) {
    case "title-tag":
      return titleMatch
        ? `The title is one of Google's strongest relevance signals. Current title "${titleMatch[1]}" does not include "${keyword}", so this page can miss that query.`
        : `The title should clearly mention "${keyword}" so search engines can map the page to that intent.`;
    case "h1-count":
      return h1Match
        ? `The H1 confirms page topic for both users and search engines. Current H1 "${h1Match[1]}" does not include "${keyword}".`
        : `A missing or misaligned H1 weakens topical clarity for the target keyword "${keyword}".`;
    case "meta-description":
      return `Your meta description is used as search snippet context. If "${keyword}" is missing, relevance and click-through can drop for that query.`;
    case "h2-keyword":
      return `At least one H2 containing "${keyword}" helps reinforce topical relevance throughout the page structure.`;
    case "pagespeed":
      if (psMatch) {
        const score = Number(psMatch[1]);
        return `Speed directly affects user drop-off and ranking signals. Current PageSpeed score is ${score}, which indicates optimization is still needed.`;
      }
      return "Page performance impacts both rankings and conversion. Slow experience can hurt visibility.";
    case "structured-data":
      return "Broken or missing structured data can prevent rich result eligibility and reduce SERP visibility.";
    case "canonical":
      return "Canonical tags tell search engines which URL version to index. Incorrect canonical setup can split ranking signals.";
    case "hreflang":
      return "Hreflang helps Google serve the right language/region version. Inconsistency can confuse international indexing.";
    case "sitemap":
      return "If key URLs are missing from sitemap coverage, crawling and indexing priority can be weaker.";
    case "robots":
      return "robots.txt controls crawl access. Incorrect directives can block or weaken discovery of important pages.";
    case "eeat-signals":
      return "Trust signals (expertise, social proof, clear company identity) influence user confidence and quality perception.";
    default:
      return details
        ? `This recommendation is based on the current finding: ${details}`
        : "This item is recommended because it affects crawlability, relevance, or trust signals.";
  }
}

function pagespeedPriorityFromDetails(details: string | null | undefined) {
  const match = details?.match(/PageSpeed score:\s*(\d+)/i);
  if (!match) return null;
  const score = Number(match[1]);
  if (!Number.isFinite(score)) return null;
  return score >= 60 ? "medium" : "high";
}

function effectivePriorityForCheck(check: { key: string; priority: string; details?: string | null }) {
  if (check.key !== "pagespeed") return check.priority;
  return pagespeedPriorityFromDetails(check.details) ?? check.priority;
}

async function fetchLiveKeywordCoverage(targetUrl: string, normalizedKeyword: string) {
  try {
    const response = await fetch(targetUrl, {
      headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = load(html);
    const currentTitle = $("title").text().trim();
    const currentH1 = $("h1").first().text().trim();
    return {
      currentTitle,
      currentH1,
      titleHasKeyword: currentTitle.toLowerCase().includes(normalizedKeyword),
      h1HasKeyword: currentH1.toLowerCase().includes(normalizedKeyword),
    };
  } catch {
    return null;
  }
}

export default async function AuditDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserRecord();
  const { id } = await params;
  const audit = await prisma.audit.findFirst({
    where: { id, userId: user.id },
    include: { checks: { orderBy: { createdAt: "asc" } } },
  });

  if (!audit) {
    notFound();
  }

  const normalizedKeyword = audit.targetKeyword.toLowerCase().trim();
  const liveKeywordCoverage = await fetchLiveKeywordCoverage(audit.targetUrl, normalizedKeyword);

  const score = audit.score ?? 0;
  const checksWithEffectivePriority = audit.checks.map((check) => {
    let priority = effectivePriorityForCheck(check);
    let status = check.status;
    let details = check.details;
    let recommendation = check.recommendation;

    if (check.key === "title-tag" && liveKeywordCoverage && !liveKeywordCoverage.titleHasKeyword) {
      priority = "critical";
      status = "fail";
      details = `Current title: "${liveKeywordCoverage.currentTitle || "Missing title"}". Target keyword "${audit.targetKeyword}" is not present in the title.`;
      recommendation = `Include the target keyword "${audit.targetKeyword}" naturally in the title and keep it 50-60 characters.`;
    }

    if (check.key === "h1-count" && liveKeywordCoverage && !liveKeywordCoverage.h1HasKeyword) {
      priority = "critical";
      status = "fail";
      details = `Current H1: "${liveKeywordCoverage.currentH1 || "Missing H1"}". Target keyword "${audit.targetKeyword}" is not present in the H1.`;
      recommendation = `Use exactly one H1 and include the target keyword "${audit.targetKeyword}" naturally.`;
    }

    return {
      ...check,
      priority,
      status,
      details,
      recommendation,
    };
  });
  const passChecks = checksWithEffectivePriority.filter((check) => check.status === "pass");
  const warningChecks = checksWithEffectivePriority.filter((check) => check.status === "warning");
  const failChecks = checksWithEffectivePriority.filter((check) => check.status === "fail");
  const scoreContext = getScoreContext(score);
  const scoreColor = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const auditedOn = audit.completedAt ?? audit.updatedAt ?? audit.createdAt;
  const startTodayItems = checksWithEffectivePriority
    .filter((check) => check.status !== "pass")
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      const aRank = rank[a.priority as keyof typeof rank] ?? 4;
      const bRank = rank[b.priority as keyof typeof rank] ?? 4;
      return aRank - bRank;
    })
    .slice(0, 2);

  const actionPlanSections = [
    { key: "critical", title: "Fix Immediately (Critical)" },
    { key: "high", title: "Fix Soon (High Impact)" },
    { key: "medium", title: "Fix Next (Medium Impact)" },
    { key: "low", title: "Long-Term (Strategic)" },
  ] as const;

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm font-semibold text-[var(--primary)]">
            ← Back to dashboard
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-container)]"
          >
            New Audit
          </Link>
        </div>
        <div className="mt-3 grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto">
            <div
              className="relative h-40 w-40 rounded-full"
              style={{
                background: `conic-gradient(${scoreColor} ${Math.round((score / 100) * 360)}deg, #e3eaef 0deg)`,
              }}
            >
              <div className="absolute inset-[12px] flex flex-col items-center justify-center rounded-full bg-[var(--surface-container-lowest)]">
                <p className="font-manrope text-4xl font-extrabold text-[var(--primary)]">{score}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface)]/58">SEO Score</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--on-surface)]/68">{scoreContext.label}</p>
              </div>
            </div>
          </div>

          <div>
            <h1 className="font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">Audit Report</h1>
            <p className="mt-2 text-sm text-[var(--on-surface)]/70">{audit.targetUrl}</p>
            <p className="mt-1 text-sm text-[var(--on-surface)]/70">
              Keyword: <span className="font-semibold">{audit.targetKeyword}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--on-surface)]/70">
              Audited on:{" "}
              <span className="font-semibold">
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(auditedOn)}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-bold uppercase tracking-wide">
                {audit.status}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                {passChecks.length} Passes
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                {warningChecks.length} Warnings
              </span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-700">
                {failChecks.length} Fails
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--on-surface)]/70">
              {failChecks.length > 0
                ? `${failChecks.length} issue${failChecks.length > 1 ? "s are" : " is"} likely hurting rankings right now.`
                : "No fail-level issues detected. Focus on warnings to lift performance."}
            </p>
            <p className="mt-1 text-sm text-[var(--on-surface)]/65">{scoreContext.note}</p>
          </div>
        </div>
      </header>

      <AuditTopicPanel
        checks={checksWithEffectivePriority.map((check) => ({
          id: check.id,
          key: check.key,
          title: check.title,
          status: check.status,
          priority: check.priority,
          details: check.details,
          recommendation: check.recommendation,
        }))}
      />

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_10px_28px_rgba(0,22,57,0.05)]">
        <h2 className="font-manrope text-lg font-extrabold text-[var(--primary)]">What to do first</h2>
        <p className="mt-1 text-sm text-[var(--on-surface)]/70">Start with these top-priority actions today:</p>
        {startTodayItems.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--on-surface)]/70">No urgent items found. Continue with medium-impact improvements.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {startTodayItems.map((item, index) => (
              <li key={item.id} className="rounded-lg bg-[var(--surface-container-low)] px-3 py-2 text-sm">
                <span className="font-semibold">{index + 1}. {item.title}</span>: {item.recommendation}
              </li>
            ))}
          </ol>
        )}
      </article>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <h2 className="font-manrope text-xl font-extrabold">SEO Fix List</h2>
        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
          Prioritized action plan. Use this first, then use Check Results for full technical detail.
        </p>
        <div className="mt-4 space-y-4">
          {actionPlanSections.map((section) => {
            const items = checksWithEffectivePriority.filter(
              (check) => check.priority === section.key && check.status !== "pass",
            );
            const style = planSectionStyle(section.key);
            return (
              <div key={section.key} className={style.wrapper}>
                <h3 className={style.title}>{section.title}</h3>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--on-surface)]/66">No items in this priority tier.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li key={item.id} className={style.item}>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--on-surface)]/74">
                          <span className="font-semibold">Fix:</span>{" "}
                          {item.recommendation ?? "No recommendation provided."}
                        </p>
                        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
                          <span className="font-semibold">Why:</span>{" "}
                          {buildPlainWhy(item, audit.targetKeyword)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
                          <span className="font-semibold">Current value:</span>{" "}
                          {item.details ?? "No current value captured for this check."}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </article>

      <section className="grid gap-6 lg:grid-cols-[1.25fr,1fr]">
        <AuditCheckResults
          checks={checksWithEffectivePriority.map((check) => ({
            id: check.id,
            key: check.key,
            title: check.title,
            status: check.status,
            priority: check.priority,
            details: check.details,
            recommendation: check.recommendation,
          }))}
        />
        <ReportMarkdownPanel
          title="Executive Report (Full)"
          description="Use this full report when sharing with your developer, SEO specialist, or agency."
          markdown={audit.reportMarkdown ?? audit.summary ?? "Report is being generated."}
        />
      </section>
    </section>
  );
}
