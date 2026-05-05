"use client";

import { useMemo, useState } from "react";
import { FileText, Layers3, Settings, ShieldCheck } from "lucide-react";
import {
  AUDIT_SECTIONS,
  parseAuditSections,
  type AuditItemStatus,
  type AuditSectionId,
  type ParsedAuditItem,
} from "@/lib/audit-text-sections";

type FilterId = "all" | AuditSectionId;

const FILTERS: Array<{
  id: FilterId;
  label: string;
  icon: typeof Layers3;
}> = [
  { id: "all", label: "All Suggestions", icon: Layers3 },
  { id: "on-page", label: "On-Page", icon: FileText },
  { id: "tech-perf", label: "Technical & Performance", icon: Settings },
  { id: "authority", label: "Authority", icon: ShieldCheck },
];

function statusPill(status: AuditItemStatus) {
  if (status === "good") return "bg-emerald-100 text-emerald-800";
  if (status === "critical") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function statusLabel(status: AuditItemStatus, raw: string) {
  if (raw && raw.trim()) return raw.trim();
  if (status === "good") return "Good";
  if (status === "critical") return "Critical";
  return "Needs Improvement";
}

function sectionStyle(status: AuditItemStatus) {
  if (status === "good") {
    return "border-emerald-200 bg-emerald-50/50";
  }
  if (status === "critical") {
    return "border-rose-200 bg-rose-50/60";
  }
  return "border-amber-200 bg-amber-50/40";
}

function sectionLabelFor(id: AuditSectionId) {
  return AUDIT_SECTIONS.find((s) => s.id === id)?.shortLabel ?? id;
}

// Items are sorted with critical first, then needs-improvement, then good — so
// the most actionable findings are surfaced at the top of every filter view.
function statusRank(status: AuditItemStatus) {
  if (status === "critical") return 0;
  if (status === "needs-improvement") return 1;
  return 2;
}

function sortItems(items: ParsedAuditItem[]) {
  return [...items].sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

export function AuditSectionsPanel({
  onPageContent,
  techPerfContent,
  authorityContent,
}: {
  onPageContent: string | null;
  techPerfContent: string | null;
  authorityContent: string | null;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const parsed = useMemo(
    () => parseAuditSections({ onPageContent, techPerfContent, authorityContent }),
    [onPageContent, techPerfContent, authorityContent],
  );

  const itemsByFilter = useMemo<Record<FilterId, ParsedAuditItem[]>>(() => {
    const all = sortItems([...parsed.onPage, ...parsed.techPerf, ...parsed.authority]);
    return {
      all,
      "on-page": sortItems(parsed.onPage),
      "tech-perf": sortItems(parsed.techPerf),
      authority: sortItems(parsed.authority),
    };
  }, [parsed]);

  const filterCounts = useMemo<Record<FilterId, number>>(() => {
    return {
      all: itemsByFilter.all.length,
      "on-page": itemsByFilter["on-page"].length,
      "tech-perf": itemsByFilter["tech-perf"].length,
      authority: itemsByFilter.authority.length,
    };
  }, [itemsByFilter]);

  const visibleItems = itemsByFilter[activeFilter];

  return (
    <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,860px)] lg:items-start lg:justify-start">
      <aside className="space-y-3">
        {FILTERS.map((filter) => {
          const Icon = filter.icon;
          const active = filter.id === activeFilter;
          const count = filterCounts[filter.id];
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left font-manrope text-base font-extrabold transition ${
                active
                  ? "bg-[var(--primary)] text-white shadow-[0_14px_26px_rgba(0,22,57,0.2)]"
                  : "bg-transparent text-[var(--on-surface)]/80 hover:bg-[var(--surface-container-low)]"
              }`}
            >
              <Icon size={20} className={active ? "text-white" : "text-[var(--on-surface)]/70"} />
              <span className="flex-1">{filter.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-[var(--surface-container-low)] text-[var(--on-surface)]/70"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </aside>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-[var(--on-surface)]/66">No items for this filter.</p>
        ) : (
          <ul className="space-y-3">
            {visibleItems.map((item, index) => {
              const label = statusLabel(item.status, item.statusRaw);
              return (
                <li
                  key={`${item.section}-${item.title}-${index}`}
                  className={`rounded-xl border bg-white px-4 py-3 ${sectionStyle(item.status)}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--surface-container-low)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--on-surface)]/75">
                      {sectionLabelFor(item.section)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusPill(item.status)}`}
                    >
                      {label}
                    </span>
                  </div>
                  <h3 className="mt-2 font-manrope text-base font-extrabold text-[var(--primary)]">
                    {item.title}
                  </h3>
                  {item.currentState ? (
                    <p className="mt-2 text-sm text-[var(--on-surface)]/85">
                      <strong className="font-bold">Current state:</strong>{" "}
                      <span className="whitespace-pre-line">{item.currentState}</span>
                    </p>
                  ) : null}
                  {item.analysis ? (
                    <p className="mt-1.5 text-sm text-[var(--on-surface)]/85">
                      <strong className="font-bold">Analysis:</strong>{" "}
                      <span className="whitespace-pre-line">{item.analysis}</span>
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-sm text-[var(--on-surface)]/85">
                    <strong className="font-bold">Status:</strong> {label}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
