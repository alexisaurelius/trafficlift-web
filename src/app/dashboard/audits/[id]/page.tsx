import Link from "next/link";
import { notFound } from "next/navigation";
import { load } from "cheerio";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { ReportMarkdownPanel } from "@/components/report-markdown-panel";
import { AuditCheckResults } from "@/components/audit-check-results";
import { AuditTopicPanel } from "@/components/audit-topic-panel";
import { ShareAuditButton } from "@/components/share-audit-button";
import {
  formatKeywordCandidatesAsQuotedList,
  matchesAnyKeywordEquivalent,
  parseKeywordCandidates,
} from "@/lib/keyword-match";
import { AUDIT_CHECKLIST } from "@/lib/seo-checklist";
import { CRO_AUDIT_CHECKLIST } from "@/lib/cro-checklist";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
const LIVE_KEYWORD_FETCH_TIMEOUT_MS = 900;

function getScoreContext(score: number) {
  if (score >= 85) return { label: "Excellent", note: "Strong SEO baseline with minor refinements needed." };
  if (score >= 70) return { label: "Good", note: "Good performance, but important opportunities remain." };
  if (score >= 55) return { label: "Needs Work", note: "Several issues are likely limiting rankings." };
  return { label: "Weak", note: "Major SEO issues are likely suppressing visibility." };
}

function getCroScoreContext(score: number) {
  if (score >= 85) return { label: "Excellent", note: "Strong conversion baseline with minor refinements needed." };
  if (score >= 70) return { label: "Good", note: "Good conversion setup, but meaningful lift opportunities remain." };
  if (score >= 55) return { label: "Needs Work", note: "Several friction points are likely reducing conversions." };
  return { label: "Weak", note: "Major conversion blockers detected. Prioritize critical fixes first." };
}


function pagespeedPriorityFromDetails(details: string | null | undefined) {
  const match = details?.match(/PageSpeed score:\s*(\d+)/i);
  if (!match) return null;
  const score = Number(match[1]);
  if (!Number.isFinite(score)) return null;
  return score >= 60 ? "medium" : "high";
}

function effectivePriorityForCheck(check: { key: string; priority: string; details?: string | null }) {
  if (check.key === "canonical") return "critical";
  if (check.key !== "pagespeed") return check.priority;
  return pagespeedPriorityFromDetails(check.details) ?? check.priority;
}

function priorityRank(priority: string) {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

async function fetchLiveKeywordCoverage(targetUrl: string, keywordCandidates: string[]) {
  try {
    const response = await fetch(targetUrl, {
      headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
      cache: "no-store",
      signal: AbortSignal.timeout(LIVE_KEYWORD_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = load(html);
    const currentTitle = $("head > title").first().text().trim() || $("title").first().text().trim();
    const currentH1 = $("h1").first().text().trim();
    return {
      currentTitle,
      currentH1,
      titleHasKeyword: matchesAnyKeywordEquivalent(currentTitle, keywordCandidates),
      h1HasKeyword: matchesAnyKeywordEquivalent(currentH1, keywordCandidates),
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

  const keywordCandidates = parseKeywordCandidates(audit.targetKeyword);
  const fallbackCandidates = keywordCandidates.length > 0 ? keywordCandidates : [audit.targetKeyword.toLowerCase().trim()];
  const targetKeywordList = formatKeywordCandidatesAsQuotedList(fallbackCandidates);
  const auditType = auditTypeFromKeyword(audit.targetKeyword);
  const liveKeywordCoverage =
    auditType === "seo" ? await fetchLiveKeywordCoverage(audit.targetUrl, fallbackCandidates) : null;
  const activeCheckKeys = new Set(
    (auditType === "cro" ? CRO_AUDIT_CHECKLIST : AUDIT_CHECKLIST).map((check) => check.key),
  );

  const score = audit.score ?? 0;
  const checksWithEffectivePriority = audit.checks.filter((check) => activeCheckKeys.has(check.key)).map((check) => {
    let priority = effectivePriorityForCheck(check);
    let status = check.status === "pass" ? "pass" : "fail";
    let details = check.details;
    let recommendation = check.recommendation;

    if (check.key === "title-tag" && liveKeywordCoverage && !liveKeywordCoverage.titleHasKeyword) {
      priority = "critical";
      status = "fail";
      details = `Current title: "${liveKeywordCoverage.currentTitle || "(empty)"}".\nTarget keyword(s): ${targetKeywordList}`;
      recommendation = `Include one target keyword naturally in the title and keep it 50-60 characters.`;
    }

    if (check.key === "h1-count" && liveKeywordCoverage && !liveKeywordCoverage.h1HasKeyword) {
      priority = "critical";
      status = "fail";
      details = `Current H1: "${liveKeywordCoverage.currentH1 || "(empty)"}".\nTarget keyword(s): ${targetKeywordList}`;
      recommendation = `Use exactly one H1 and include one target keyword naturally.`;
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
  const failChecks = checksWithEffectivePriority.filter((check) => check.status === "fail");
  const topCroRisks =
    auditType === "cro"
      ? [...failChecks]
          .filter((check) => check.priority === "critical" || check.priority === "high")
          .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
          .slice(0, 7)
      : [];
  const hiddenCroRiskCount =
    auditType === "cro"
      ? Math.max(
          failChecks.filter((check) => check.priority === "critical" || check.priority === "high").length - topCroRisks.length,
          0,
        )
      : 0;
  const scoreContext = auditType === "cro" ? getCroScoreContext(score) : getScoreContext(score);
  const scoreColor = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const auditedOn = audit.completedAt ?? audit.updatedAt ?? audit.createdAt;

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={auditType === "cro" ? "/dashboard/cro" : "/dashboard"} className="text-sm font-semibold text-[var(--primary)]">
            ← Back to dashboard
          </Link>
          <div className="flex items-center gap-2">
            <ShareAuditButton auditId={audit.id} />
            <Link
              href={auditType === "cro" ? "/dashboard/cro" : "/dashboard"}
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-container)]"
            >
              New Audit
            </Link>
          </div>
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface)]/58">
                  {auditType === "cro" ? "CRO Score" : "SEO Score"}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--on-surface)]/68">{scoreContext.label}</p>
              </div>
            </div>
          </div>

          <div>
            <h1 className="font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">Audit Report</h1>
            <p className="mt-2 text-sm text-[var(--on-surface)]/70">{audit.targetUrl}</p>
            {auditType === "seo" ? (
              <p className="mt-1 text-sm text-[var(--on-surface)]/70">
                Target keyword(s): <span className="font-semibold">{targetKeywordList}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--on-surface)]/70">
                Audit type: <span className="font-semibold">CRO Audit</span>
              </p>
            )}
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
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-700">
                {failChecks.length} Fails
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--on-surface)]/70">
              {failChecks.length > 0
                ? `${failChecks.length} issue${failChecks.length > 1 ? "s are" : " is"} likely hurting ${
                    auditType === "cro" ? "conversions" : "rankings"
                  } right now.`
                : `No fail-level issues detected. Strong ${auditType === "cro" ? "conversion" : "SEO"} baseline across checks.`}
            </p>
            <p className="mt-1 text-sm text-[var(--on-surface)]/65">{scoreContext.note}</p>
          </div>
        </div>
      </header>

      {auditType === "cro" ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h2 className="font-manrope text-lg font-extrabold text-rose-800">Critical Conversion Risks</h2>
          {topCroRisks.length === 0 ? (
            <p className="mt-2 text-sm text-rose-800/85">No critical conversion blockers detected.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {topCroRisks.map((risk) => (
                <li key={risk.id} className="rounded-xl border border-rose-200 bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-rose-800">{risk.title}</p>
                  <p className="mt-1 text-sm text-rose-900/85">{risk.recommendation ?? "Review this item immediately."}</p>
                </li>
              ))}
              {hiddenCroRiskCount > 0 ? (
                <li className="text-sm font-semibold text-rose-800/85">+{hiddenCroRiskCount} more high/critical fails below.</li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

      <AuditTopicPanel
        auditType={auditType}
        targetKeyword={audit.targetKeyword}
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
          shareAuditId={audit.id}
          markdown={audit.reportMarkdown ?? audit.summary ?? "Report is being generated."}
        />
      </section>
    </section>
  );
}
