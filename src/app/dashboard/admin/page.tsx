import { requireAdminUserRecord } from "@/lib/auth-user";
import { AdminAuditsPanel } from "@/components/admin-audits-panel";

export default async function AdminDashboardPage() {
  await requireAdminUserRecord();

  return (
    <section className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="font-manrope text-[30px] font-extrabold tracking-tight text-[var(--primary)]">Admin Audit Uploads</h1>
        <p className="max-w-2xl text-sm text-[var(--on-surface)]/68">
          Upload and finalize manual SEO/CRO audits. This view is restricted to admin.
        </p>
      </header>

      <AdminAuditsPanel />
    </section>
  );
}
