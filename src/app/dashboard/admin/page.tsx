import { requireAdminUserRecord } from "@/lib/auth-user";
import { AdminAuditsPanel } from "@/components/admin-audits-panel";

export default async function AdminDashboardPage() {
  await requireAdminUserRecord();

  return (
    <section className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="font-manrope text-[30px] font-extrabold tracking-tight text-[var(--primary)]">Admin Audit Uploads</h1>
        <p className="max-w-2xl text-sm text-[var(--on-surface)]/68">
          Upload and finalize manual SEO/CRO audits. Each request has a unique deep-link at{" "}
          <code className="rounded bg-[var(--surface-container-low)] px-1 text-xs">/dashboard/admin/&lt;auditId&gt;</code>{" "}
          (also included in the new-request alert email).
        </p>
      </header>

      <AdminAuditsPanel />
    </section>
  );
}
