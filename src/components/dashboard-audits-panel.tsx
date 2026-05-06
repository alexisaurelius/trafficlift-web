"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OrderAuditForm } from "@/components/order-audit-form";
import { formatKeywordCandidatesAsQuotedList, parseKeywordCandidates } from "@/lib/keyword-match";
import type { AuditType } from "@/lib/audit-mode";
import { isCroAuditKeyword } from "@/lib/audit-mode";

type AuditItem = {
  id: string;
  targetUrl: string;
  targetKeyword: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  score: number | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

type DashboardAuditsPanelProps = {
  initialAudits: AuditItem[];
  availableCredits: string | number;
  auditsOrdered: number;
  auditsCompleted: number;
  auditType?: AuditType;
};

const MANUAL_REVIEW_UNLOCK_MS = 22 * 60 * 60 * 1000;

function estimateProgress(audit: AuditItem) {
  const elapsedMs = Math.max(0, Date.now() - new Date(audit.createdAt).getTime());
  return Math.min(100, Math.round((elapsedMs / MANUAL_REVIEW_UNLOCK_MS) * 100));
}

function scoreBarColor(score: number | null) {
  if (score === null) return "bg-[#22c55e]";
  if (score >= 80) return "bg-[#22c55e]";
  if (score >= 60) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

function statusColor(status: AuditItem["status"]) {
  if (status === "COMPLETED") return "text-emerald-700 bg-emerald-50";
  if (status === "FAILED") return "text-rose-700 bg-rose-50";
  if (status === "RUNNING") return "text-amber-700 bg-amber-50";
  return "text-[var(--primary)] bg-[var(--surface-container-low)]";
}

export function DashboardAuditsPanel({
  initialAudits,
  availableCredits,
  auditsOrdered,
  auditsCompleted,
  auditType = "seo",
}: DashboardAuditsPanelProps) {
  const [audits, setAudits] = useState<AuditItem[]>(initialAudits);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);

  const hasActiveAudits = useMemo(
    () => audits.some((audit) => audit.status === "QUEUED" || audit.status === "RUNNING"),
    [audits],
  );

  const refreshAudits = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/audits?type=${auditType}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { audits?: AuditItem[] };
      if (Array.isArray(data.audits)) {
        setAudits(data.audits.slice(0, 10));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [auditType]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isPageVisible) {
      return;
    }

    const intervalMs = hasActiveAudits ? 4000 : 12000;
    const timer = setInterval(() => {
      void refreshAudits();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [hasActiveAudits, refreshAudits, isPageVisible]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <OrderAuditForm
          auditType={auditType}
          onCreated={() => {
            void refreshAudits();
          }}
        />
        <section className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-manrope text-xl font-extrabold">Recent Audits</h2>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">
              <span
                className={`h-2 w-2 rounded-full ${hasActiveAudits ? "animate-pulse bg-[#22c55e]" : "bg-[var(--on-surface)]/35"}`}
              />
              {isRefreshing ? "Syncing..." : hasActiveAudits ? "Status updates on" : "Auto sync on"}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {audits.length === 0 ? (
              <p className="text-sm text-[var(--on-surface)]/70">
                No audits yet. Start your first {auditType === "cro" ? "CRO" : "SEO"} audit.
              </p>
            ) : (
              audits.map((audit) => {
                const progress = estimateProgress(audit);
                const elapsedMs = Math.max(0, Date.now() - new Date(audit.createdAt).getTime());
                const isUnlockReady =
                  audit.status === "COMPLETED" || audit.status === "FAILED" || elapsedMs >= MANUAL_REVIEW_UNLOCK_MS;
                const isActive = !isUnlockReady;
                const completedPercent = audit.score ?? 100;
                const isCro = isCroAuditKeyword(audit.targetKeyword);
                const keywordCandidates = parseKeywordCandidates(audit.targetKeyword);
                const targetKeywordList = isCro
                  ? "CRO Audit"
                  : formatKeywordCandidatesAsQuotedList(
                      keywordCandidates.length > 0 ? keywordCandidates : [audit.targetKeyword],
                    );

                const cardContent = (
                  <div className="group block rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_6%,white)] bg-[var(--surface)] px-4 py-4 transition hover:-translate-y-[1px] hover:bg-[var(--surface-container-low)] hover:shadow-[0_10px_20px_rgba(0,22,57,0.08)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusColor(audit.status)}`}
                        >
                          {isUnlockReady && audit.status !== "FAILED" ? "READY" : "IN PROGRESS"}
                        </p>
                        <h3 className="mt-2 font-semibold">{targetKeywordList}</h3>
                        <p className="mt-1 truncate text-sm text-[var(--on-surface)]/70">{audit.targetUrl}</p>
                      </div>
                      <p className="rounded-lg bg-[var(--surface-container-low)] px-2.5 py-1 text-sm font-bold">
                        {audit.score ? `${audit.score}/100` : "--"}
                      </p>
                    </div>

                    <div className="mt-3 h-2 w-full rounded-full bg-[var(--surface-container-low)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          audit.status === "FAILED"
                            ? "bg-rose-500"
                            : isActive
                              ? "bg-[#22c55e]"
                              : scoreBarColor(audit.score)
                        }`}
                        style={{ width: `${isActive ? progress : Math.max(progress, completedPercent)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-xs text-[var(--on-surface)]/65">
                        {isActive
                          ? "Audit in progress. Unlocks within 24h. An email notification will be sent when complete."
                          : audit.status === "FAILED"
                            ? (audit.errorMessage ?? "Audit failed.")
                            : "Ready to open your audit."}
                      </p>
                      <p className="text-xs font-semibold text-[var(--primary)]/76 transition group-hover:text-[var(--primary)]">
                        {isUnlockReady ? "View report →" : ""}
                      </p>
                    </div>
                  </div>
                );

                return isUnlockReady ? (
                  <Link key={audit.id} href={`/dashboard/audits/${audit.id}`}>
                    {cardContent}
                  </Link>
                ) : (
                  <div key={audit.id} className="cursor-not-allowed opacity-90">
                    {cardContent}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-3">
        <article className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] px-4 py-2.5 shadow-[0_8px_24px_rgba(0,22,57,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Available Credits</p>
          <h2 className="mt-0.5 font-manrope text-2xl font-extrabold leading-none">{availableCredits}</h2>
          <p className="mt-0.5 text-xs text-[var(--on-surface)]/60">Remaining in current billing cycle</p>
        </article>
        <article className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] px-4 py-2.5 shadow-[0_8px_24px_rgba(0,22,57,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Audits Ordered</p>
          <h2 className="mt-0.5 font-manrope text-2xl font-extrabold leading-none">{auditsOrdered}</h2>
          <p className="mt-0.5 text-xs text-[var(--on-surface)]/60">Total audits submitted</p>
        </article>
        <article className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] px-4 py-2.5 shadow-[0_8px_24px_rgba(0,22,57,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Audits Completed</p>
          <h2 className="mt-0.5 font-manrope text-2xl font-extrabold leading-none">{auditsCompleted}</h2>
          <p className="mt-0.5 text-xs text-[var(--on-surface)]/60">Successfully delivered</p>
        </article>
      </aside>
    </div>
  );
}
