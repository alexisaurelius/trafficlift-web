import Link from "next/link";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

function statusBadge(status: string) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "bg-rose-50 text-rose-700";
  if (status === "RUNNING") return "bg-amber-50 text-amber-700";
  return "bg-[var(--surface-container-low)] text-[var(--primary)]";
}

export default async function MyAuditsPage() {
  const user = await requireUserRecord();
  const audits = await prisma.audit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/65">
          Audit Library
        </p>
        <h1 className="font-manrope text-[32px] font-extrabold tracking-tight text-[var(--primary)]">My Audits</h1>
        <p className="max-w-2xl text-sm text-[var(--on-surface)]/70">
          Access every audit created so far and open full reports anytime.
        </p>
      </header>

      <section className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-manrope text-xl font-extrabold">All Audits</h2>
          <span className="rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/65">
            {audits.length} total
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {audits.length === 0 ? (
            <p className="text-sm text-[var(--on-surface)]/70">No audits yet.</p>
          ) : (
            audits.map((audit) => (
              <Link
                key={audit.id}
                href={`/dashboard/audits/${audit.id}`}
                className="block rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_6%,white)] bg-[var(--surface)] px-4 py-4 transition hover:-translate-y-[1px] hover:bg-[var(--surface-container-low)] hover:shadow-[0_10px_20px_rgba(0,22,57,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadge(audit.status)}`}
                    >
                      {audit.status}
                    </p>
                    <h3 className="mt-2 font-semibold">{audit.targetKeyword}</h3>
                    <p className="mt-1 truncate text-sm text-[var(--on-surface)]/70">{audit.targetUrl}</p>
                  </div>
                  <div className="text-right">
                    <p className="rounded-lg bg-[var(--surface-container-low)] px-2.5 py-1 text-sm font-bold">
                      {audit.score ? `${audit.score}/100` : "--"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--on-surface)]/58">
                      {new Date(audit.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
