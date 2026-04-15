import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ChevronDown } from "lucide-react";
import { DashboardNav } from "@/components/dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--surface)] text-[var(--on-surface)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(80%_70%_at_50%_0%,rgba(0,42,95,0.11),rgba(252,249,248,0))]" />
      <div className="pointer-events-none absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.16),rgba(34,197,94,0))]" />

      <header className="z-20 bg-[color:color-mix(in_oklab,var(--surface)_90%,transparent)] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-6 py-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[color:color-mix(in_oklab,var(--surface-container-lowest)_88%,transparent)] px-5 py-3 shadow-[0_14px_34px_rgba(0,22,57,0.08)]">
            <div className="justify-self-start">
              <Link href="/dashboard" className="font-manrope text-[26px] font-extrabold tracking-tight text-[var(--primary)]">
                <span>Traffic</span>
                <span className="relative inline-block -rotate-6 origin-bottom-left text-[#22c55e]">
                  Lift
                  <svg
                    viewBox="0 0 48 12"
                    width="40"
                    height="9"
                    aria-hidden="true"
                    className="absolute left-0 top-[85%] rotate-6 text-[#22c55e]"
                  >
                    <path
                      d="M1 9 L14 7 L24 8 L41 3.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M41 3.2 L37.3 1.7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M41 3.2 L38.6 5.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            </div>
            <div className="justify-self-center">
              <DashboardNav />
            </div>
            <div className="flex items-center justify-self-end gap-1.5">
              <UserButton />
              <ChevronDown size={14} className="text-[var(--on-surface)]/55" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 pb-8 pt-5">{children}</main>
    </div>
  );
}
