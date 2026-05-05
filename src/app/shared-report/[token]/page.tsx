import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuditSectionsPanel } from "@/components/audit-sections-panel";
import { AuditSummaryCard } from "@/components/audit-summary-card";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
import { countStatuses, parseAuditSections } from "@/lib/audit-text-sections";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const audit = await prisma.audit.findFirst({ where: { shareToken: token } });
  if (!audit) notFound();

  const auditType = auditTypeFromKeyword(audit.targetKeyword);
  const parsed = parseAuditSections({
    onPageContent: audit.onPageContent,
    techPerfContent: audit.techPerfContent,
    authorityContent: audit.authorityContent,
  });
  const counts = countStatuses(parsed);

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <p className="inline-flex rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/65">
          Shared {auditType === "cro" ? "CRO" : "SEO"} Report
        </p>
        <h1 className="mt-3 font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">
          Audit Report
        </h1>
        <p className="mt-2 text-sm text-[var(--on-surface)]/70 break-all">
          <span className="font-semibold text-[var(--primary)]">Audited page:</span> {audit.targetUrl}
        </p>
        {auditType === "seo" && audit.targetKeyword.trim() ? (
          <p className="mt-1 text-sm text-[var(--on-surface)]/70 break-words">
            <span className="font-semibold text-[var(--primary)]">Keywords:</span> {audit.targetKeyword}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            {counts.good} Good
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
            {counts.needsImprovement} Needs Improvement
          </span>
          {counts.critical > 0 ? (
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-700">
              {counts.critical} Critical
            </span>
          ) : null}
          {counts.verify > 0 ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
              {counts.verify} Verify
            </span>
          ) : null}
        </div>
      </header>

      <AuditSummaryCard summary={audit.summary} />

      <AuditSectionsPanel
        onPageContent={audit.onPageContent}
        techPerfContent={audit.techPerfContent}
        authorityContent={audit.authorityContent}
      />
    </section>
  );
}
