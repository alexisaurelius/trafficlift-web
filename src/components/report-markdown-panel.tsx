"use client";

import { useState } from "react";

type ReportMarkdownPanelProps = {
  title: string;
  description: string;
  markdown: string;
};

export function ReportMarkdownPanel({ title, description, markdown }: ReportMarkdownPanelProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-manrope text-xl font-extrabold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--on-surface)]/70">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary)] transition hover:bg-[var(--surface-container-high)]"
        >
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>
      <pre className="mt-4 max-h-[760px] overflow-auto rounded-xl bg-[var(--surface)] p-4 whitespace-pre-wrap text-sm leading-6 text-[var(--on-surface)]/85">
        {markdown}
      </pre>
    </article>
  );
}
