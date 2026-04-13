"use client";

import { useState } from "react";

export function ShareAuditButton({ auditId }: { auditId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShare() {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/audits/${auditId}/share`, { method: "POST" });
      const payload = (await response.json()) as { shareUrl?: string; error?: string };

      if (!response.ok || !payload.shareUrl) {
        throw new Error(payload.error ?? "Could not create share link.");
      }

      await navigator.clipboard.writeText(payload.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create share link.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onShare}
        disabled={isLoading}
        className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-container)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? "Creating..." : copied ? "Link copied" : "Share Audit"}
      </button>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
