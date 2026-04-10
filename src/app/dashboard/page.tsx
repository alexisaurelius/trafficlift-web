import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { DashboardAuditsPanel } from "@/components/dashboard-audits-panel";

export default async function DashboardPage() {
  const user = await requireUserRecord();
  const devBillingBypass = process.env.NODE_ENV !== "production" && process.env.DEV_BILLING_BYPASS !== "false";
  const audits = await prisma.audit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const availableCredits = devBillingBypass ? "Unlimited (Dev)" : (user.subscription?.availableCredits ?? 0);
  const completedCount = audits.filter((audit) => audit.status === "COMPLETED").length;

  return (
    <section className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="font-manrope text-[30px] font-extrabold tracking-tight text-[var(--primary)]">SEO Audit Dashboard</h1>
        <p className="max-w-2xl text-sm text-[var(--on-surface)]/68">
          Queue new audits, track live processing, and open completed reports instantly.
        </p>
      </header>

      <DashboardAuditsPanel
        availableCredits={availableCredits}
        auditsOrdered={audits.length}
        auditsCompleted={completedCount}
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
