import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { AuditSectionsPanel } from "@/components/audit-sections-panel";
import { AuditSummaryCard } from "@/components/audit-summary-card";
import { ShareAuditButton } from "@/components/share-audit-button";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
import { countStatuses, parseAuditSections } from "@/lib/audit-text-sections";

export default async function AuditDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserRecord();
  const { id } = await params;
  const audit = await prisma.audit.findFirst({
    where: { id, userId: user.id },
  });

  if (!audit) {
    notFound();
  }

  const auditType = auditTypeFromKeyword(audit.targetKeyword);
  const parsed = parseAuditSections({
    onPageContent: audit.onPageContent,
    techPerfContent: audit.techPerfContent,
    authorityContent: audit.authorityContent,
  });
  const counts = countStatuses(parsed);
  const auditedOn = audit.completedAt ?? audit.updatedAt ?? audit.createdAt;
  const hasContent = counts.total > 0;

  return (
    <section className="space-y-6">
      {(audit.status === "QUEUED" || audit.status === "RUNNING") && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Manual audit in progress</p>
          <p className="mt-1">
            Your request has been received and assigned for specialist review. Your completed audit will be uploaded here within 24 hours.
          </p>
        </div>
      )}
      {audit.status === "FAILED" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Audit failed</p>
          <p className="mt-1 whitespace-pre-wrap">{audit.errorMessage ?? "Unknown error. Try again or use a different URL."}</p>
        </div>
      )}
      {audit.status === "COMPLETED" && !hasContent && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4 text-sm text-rose-900">
          <p className="font-semibold">No audit findings uploaded yet</p>
          <p className="mt-1">Your specialist is still finalising the report. Refresh shortly.</p>
        </div>
      )}
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
        <div className="mt-4">
          <h1 className="font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">Audit Report</h1>
          <p className="mt-2 text-sm text-[var(--on-surface)]/70 break-all">{audit.targetUrl}</p>
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
          </div>
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
