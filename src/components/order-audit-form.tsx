"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditType } from "@/lib/audit-mode";

type OrderAuditFormProps = {
  onCreated?: (auditId: string) => void;
  auditType?: AuditType;
};

export function OrderAuditForm({ onCreated, auditType = "seo" }: OrderAuditFormProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsCredits, setNeedsCredits] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setNeedsCredits(false);

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          targetKeyword: auditType === "seo" ? targetKeyword : "",
          auditType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) {
          setNeedsCredits(true);
          setMessage("You do not have enough credits to run this audit.");
        } else {
          setMessage(data.error ?? "Unable to create audit.");
        }
      } else {
        setMessage("Audit queued. Live progress will update automatically.");
        if (data.auditId) {
          onCreated?.(data.auditId);
        }
        setTargetUrl("");
        if (auditType === "seo") {
          setTargetKeyword("");
        }
      }
    } catch {
      setMessage("Request failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full flex-col gap-3.5 rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]"
    >
      <div>
        <h2 className="font-manrope text-xl font-extrabold">Order New {auditType === "cro" ? "CRO" : "SEO"} Audit</h2>
        <p className="mt-1 text-sm text-[var(--on-surface)]/66">
          {auditType === "seo"
            ? "Submit a URL and up to 3 target keywords (comma-separated). We handle the analysis and review."
            : "Submit a page URL. We run a full CRO checklist and return prioritized conversion recommendations."}
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Page URL</label>
        <input
          type="url"
          required
          placeholder="https://example.com/page"
          className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface-container-low)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--on-surface)]/42 focus:border-[color:color-mix(in_oklab,var(--primary)_30%,white)] focus:bg-[var(--surface-container-lowest)] focus:ring-2 focus:ring-[color:color-mix(in_oklab,var(--primary)_24%,white)]"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />
      </div>
      {auditType === "seo" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            Target Keyword(s)
          </label>
          <input
            type="text"
            required
            placeholder="e.g. personal injury lawyer chicago, chicago personal injury lawyer"
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface-container-low)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--on-surface)]/42 focus:border-[color:color-mix(in_oklab,var(--primary)_30%,white)] focus:bg-[var(--surface-container-lowest)] focus:ring-2 focus:ring-[color:color-mix(in_oklab,var(--primary)_24%,white)]"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
          />
          <p className="text-xs text-[var(--on-surface)]/60">
            Add up to 3 interchangeable keyword variants you want to rank for
          </p>
        </div>
      ) : null}
      <button
        disabled={isSubmitting}
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-3xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,22,57,0.18)] transition hover:scale-[1.01] hover:bg-[var(--primary-container)] disabled:opacity-60"
      >
        {isSubmitting ? "Queueing Audit..." : "Start Audit"}
      </button>
      <div className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)] px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">What happens next</p>
        <p className="mt-1 text-sm text-[var(--on-surface)]">
          Automated checks run immediately, then your report is usually ready in under 10 minutes with prioritized actions.
        </p>
      </div>
      <div className="mt-auto rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)] px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/58">Need help?</p>
        <p className="mt-1 text-sm text-[var(--on-surface)]/78">
          Review a sample report structure before ordering your next audit.
        </p>
        <Link href="/#how" className="mt-2 inline-flex text-sm font-semibold text-[var(--primary)]">
          View sample report →
        </Link>
      </div>
      {message ? (
        <div className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2 text-sm text-[var(--on-surface)]/80">
          <p>{message}</p>
          {needsCredits ? (
            <Link href="/dashboard/billing" className="mt-2 inline-flex font-semibold text-[var(--primary)]">
              Buy credits in Billing →
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
