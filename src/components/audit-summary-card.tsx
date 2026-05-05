import type { ReactNode } from "react";

type SummarySegment = { type: "text" | "bold" | "code"; value: string };

/** Parses lightweight markdown used in admin summaries: **bold** and `inline code`. */
function segmentRichSummary(line: string): SummarySegment[] {
  const segments: SummarySegment[] = [];
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const close = line.indexOf("**", i + 2);
      if (close !== -1) {
        segments.push({ type: "bold", value: line.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    if (line[i] === "`") {
      const close = line.indexOf("`", i + 1);
      if (close !== -1) {
        segments.push({ type: "code", value: line.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    let j = i + 1;
    while (j < line.length) {
      if (line.startsWith("**", j)) {
        const end = line.indexOf("**", j + 2);
        if (end !== -1) break;
      }
      if (line[j] === "`") {
        const end = line.indexOf("`", j + 1);
        if (end !== -1) break;
      }
      j++;
    }
    segments.push({ type: "text", value: line.slice(i, j) });
    i = j;
  }
  return segments;
}

function SummaryFormattedText({ text }: { text: string }): ReactNode {
  const segments = segmentRichSummary(text);
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === "bold") {
          return (
            <strong key={idx} className="font-bold text-[var(--on-surface)]">
              {seg.value}
            </strong>
          );
        }
        if (seg.type === "code") {
          return (
            <code
              key={idx}
              className="rounded bg-[var(--surface-container-low)] px-1 py-0.5 font-mono text-[13px] text-[var(--on-surface)]/90"
            >
              {seg.value}
            </code>
          );
        }
        return <span key={idx}>{seg.value}</span>;
      })}
    </>
  );
}

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
        <h2 className="font-manrope text-xl font-extrabold text-[var(--primary)]">Top Priorities</h2>
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
              <p className="text-sm text-[var(--on-surface)]/85">
                <SummaryFormattedText text={item} />
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--on-surface)]/85">
          <SummaryFormattedText text={parsed.value} />
        </p>
      )}
    </article>
  );
}
