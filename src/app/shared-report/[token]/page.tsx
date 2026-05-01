import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuditCheckResults } from "@/components/audit-check-results";
import { AuditTopicPanel } from "@/components/audit-topic-panel";
import { ReportMarkdownPanel } from "@/components/report-markdown-panel";
import { formatKeywordCandidatesAsQuotedList, parseKeywordCandidates } from "@/lib/keyword-match";
import { AUDIT_CHECKLIST } from "@/lib/seo-checklist";
import { CRO_AUDIT_CHECKLIST } from "@/lib/cro-checklist";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
import { orderChecksForDisplay } from "@/lib/audit-check-order";

function effectivePriorityForCheck(check: { key: string; priority: string; details?: string | null }) {
  if (check.key === "canonical") return "critical";
  return check.priority;
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const audit = await prisma.audit.findFirst({
    where: { shareToken: token },
    include: { checks: { orderBy: { createdAt: "asc" } } },
  });

  if (!audit) notFound();
  const keywordCandidates = parseKeywordCandidates(audit.targetKeyword);
  const targetKeywordList = formatKeywordCandidatesAsQuotedList(
    keywordCandidates.length > 0 ? keywordCandidates : [audit.targetKeyword],
  );

  const checklistTemplate = auditTypeFromKeyword(audit.targetKeyword) === "cro" ? CRO_AUDIT_CHECKLIST : AUDIT_CHECKLIST;
  const orderedChecks = orderChecksForDisplay(audit.checks, checklistTemplate);
  const checksWithEffectivePriority = orderedChecks.map((check) => ({
    ...check,
    priority: effectivePriorityForCheck(check),
  }));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <p className="inline-flex rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/65">
          Shared SEO Report
        </p>
        <h1 className="mt-3 font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">
          Audit Report
        </h1>
        <p className="mt-2 text-sm text-[var(--on-surface)]/70">{audit.targetUrl}</p>
        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
          Target keyword(s): <span className="font-semibold">{targetKeywordList}</span>
        </p>
        <p className="mt-1 text-sm text-[var(--on-surface)]/65">
          Score: <span className="font-semibold">{audit.score ?? "--"}/100</span>
        </p>
      </header>

      <AuditTopicPanel
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
          description="Read-only shared report view."
          markdown={audit.reportMarkdown ?? audit.summary ?? "Report is being generated."}
        />
      </section>
    </section>
  );
}
