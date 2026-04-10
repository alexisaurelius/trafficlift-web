"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "SEO Audit" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/my-audits", label: "My Audits" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl bg-[var(--surface-container-low)]/85 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
      <div className="flex items-center gap-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-[0_8px_18px_rgba(0,22,57,0.1)]"
                  : "text-[var(--on-surface)]/72 hover:bg-[var(--surface-container-high)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
