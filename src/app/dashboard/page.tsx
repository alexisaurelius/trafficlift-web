import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { DashboardAuditsPanel } from "@/components/dashboard-audits-panel";
import { CRO_AUDIT_KEYWORD } from "@/lib/audit-mode";

export default async function DashboardPage() {
  const user = await requireUserRecord();
  const devBillingBypass = process.env.NODE_ENV !== "production" && process.env.DEV_BILLING_BYPASS !== "false";
  const [audits, auditsOrdered, auditsCompleted] = await Promise.all([
    prisma.audit.findMany({
      where: { userId: user.id, targetKeyword: { not: CRO_AUDIT_KEYWORD } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        targetUrl: true,
        targetKeyword: true,
        status: true,
        score: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    }),
    prisma.audit.count({ where: { userId: user.id, targetKeyword: { not: CRO_AUDIT_KEYWORD } } }),
    prisma.audit.count({ where: { userId: user.id, targetKeyword: { not: CRO_AUDIT_KEYWORD }, status: "COMPLETED" } }),
  ]);

  const availableCredits = devBillingBypass ? "Unlimited (Dev)" : (user.subscription?.availableCredits ?? 0);

  return (
    <section className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="font-manrope text-[30px] font-extrabold tracking-tight text-[var(--primary)]">SEO Audit Dashboard</h1>
        <p className="max-w-2xl text-sm text-[var(--on-surface)]/68">
          Submit new audits, track request status, and receive specialist-reviewed reports within 24 hours.
        </p>
      </header>

      <DashboardAuditsPanel
        auditType="seo"
        availableCredits={availableCredits}
        auditsOrdered={auditsOrdered}
        auditsCompleted={auditsCompleted}
        initialAudits={audits.map((audit) => ({
          id: audit.id,
          targetUrl: audit.targetUrl,
          targetKeyword: audit.targetKeyword,
          status: audit.status,
          score: audit.score,
          createdAt: audit.createdAt.toISOString(),
          completedAt: audit.completedAt ? audit.completedAt.toISOString() : null,
          errorMessage: audit.errorMessage ?? null,
        }))}
      />
    </section>
  );
}
