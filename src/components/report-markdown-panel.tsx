"use client";

import { useState } from "react";

type ReportMarkdownPanelProps = {
  title: string;
  description: string;
  markdown: string;
  shareAuditId?: string;
};

export function ReportMarkdownPanel({ title, description, markdown, shareAuditId }: ReportMarkdownPanelProps) {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function onShare() {
    if (!shareAuditId || shareLoading) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const response = await fetch(`/api/audits/${shareAuditId}/share`, { method: "POST" });
      const payload = (await response.json()) as { shareUrl?: string; error?: string };
      if (!response.ok || !payload.shareUrl) {
        throw new Error(payload.error || "Could not create share link");
      }
      await navigator.clipboard.writeText(payload.shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create share link";
      setShareError(message);
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-manrope text-xl font-extrabold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--on-surface)]/70">{description}</p>
          {shareError ? <p className="mt-1 text-xs text-rose-700">{shareError}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {shareAuditId ? (
            <button
              type="button"
              onClick={onShare}
              disabled={shareLoading}
              className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[var(--primary-container)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {shareLoading ? "Creating..." : shareCopied ? "Link copied" : "Share report"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary)] transition hover:bg-[var(--surface-container-high)]"
          >
            {copied ? "Copied" : "Copy report"}
          </button>
        </div>
      </div>
      <pre className="mt-4 max-h-[760px] overflow-auto rounded-xl bg-[var(--surface)] p-4 whitespace-pre-wrap text-sm leading-6 text-[var(--on-surface)]/85">
        {markdown}
      </pre>
    </article>
  );
}
