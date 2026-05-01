import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { AdminAuditsPanel } from "@/components/admin-audits-panel";
import { auditTypeFromKeyword } from "@/lib/audit-mode";

export default async function AdminAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminUserRecord();
  const { id } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });

  if (!audit) {
    notFound();
  }

  const mode = auditTypeFromKeyword(audit.targetKeyword);

  return (
    <section className="space-y-5">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/60">
          <Link href="/dashboard/admin" className="text-[var(--primary)] hover:underline">
            ← All requests
          </Link>
          <span>•</span>
          <span>{mode === "cro" ? "CRO" : "SEO"} audit</span>
          <span>•</span>
          <span>{audit.status}</span>
        </div>
        <h1 className="font-manrope text-[30px] font-extrabold tracking-tight text-[var(--primary)]">
          Admin: {audit.user.email}
        </h1>
        <p className="break-all text-sm text-[var(--on-surface)]/70">
          {audit.targetUrl} —{" "}
          <span className="font-semibold">
            {mode === "cro" ? "CRO audit request" : audit.targetKeyword}
          </span>
        </p>
        <p className="text-xs text-[var(--on-surface)]/55">
          Audit ID: <code className="rounded bg-[var(--surface-container-low)] px-1">{audit.id}</code>
        </p>
      </header>

      <AdminAuditsPanel initialSelectedId={audit.id} />
    </section>
  );
}
