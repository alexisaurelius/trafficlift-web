import { Sparkles } from "lucide-react";

// Detect numbered list lines like "1. ..." / "2. ..." so we can render them as
// a proper ordered list. Falls back to a paragraph block otherwise.
function parseSummary(summary: string): { kind: "list"; items: string[] } | { kind: "text"; value: string } {
  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2 && lines.every((line) => /^\d+\.\s+/.test(line))) {
    return {
      kind: "list",
      items: lines.map((line) => line.replace(/^\d+\.\s+/, "").trim()),
    };
  }
  return { kind: "text", value: summary };
}

export function AuditSummaryCard({ summary }: { summary: string | null }) {
  if (!summary || !summary.trim()) {
    return null;
  }
  const parsed = parseSummary(summary.trim());

  return (
    <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--primary)_12%,white)] text-[var(--primary)]">
          <Sparkles size={18} />
        </span>
        <h2 className="font-manrope text-xl font-extrabold text-[var(--primary)]">Summary</h2>
      </div>
      {parsed.kind === "list" ? (
        <ol className="mt-4 space-y-2">
          {parsed.items.map((item, index) => (
            <li
              key={index}
              className="flex gap-3 rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)] px-4 py-3"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">
                {index + 1}
              </span>
              <p className="text-sm text-[var(--on-surface)]/85">{item}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--on-surface)]/85">{parsed.value}</p>
      )}
    </article>
  );
}
