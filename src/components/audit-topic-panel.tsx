"use client";

import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { FileText, KeyRound, Layers3, Settings, Telescope } from "lucide-react";

type CheckItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  details: string | null;
  recommendation: string | null;
};

type TopicConfig = {
  id: string;
  label: string;
  keys: string[];
  icon: ComponentType<{ size?: number; className?: string }>;
};

const TOPICS: TopicConfig[] = [
  {
    id: "all-suggestions",
    label: "All Suggestions",
    keys: [],
    icon: Layers3,
  },
  {
    id: "on-page",
    label: "On-Page",
    keys: ["title-tag", "meta-description", "h1-count", "h2-keyword", "heading-hierarchy", "alt-text"],
    icon: FileText,
  },
  {
    id: "keywords",
    label: "Keywords",
    keys: ["keyword-usage", "meta-redundancy", "title-tag", "h1-count", "h2-keyword"],
    icon: KeyRound,
  },
  {
    id: "technical",
    label: "Technical",
    keys: [
      "structured-data",
      "schema-coverage",
      "canonical",
      "canonical-consistency",
      "hreflang",
      "hreflang-consistency",
      "sitemap",
      "sitemap-depth",
      "robots",
      "robots-ai-policy",
      "pagespeed",
      "image-performance",
      "social-tags",
      "twitter-card-coverage",
    ],
    icon: Settings,
  },
  {
    id: "authority",
    label: "Authority",
    keys: ["site-architecture", "eeat-signals", "author-credibility"],
    icon: Telescope,
  },
];

function priorityWeight(priority: string) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function statusWeight(status: string) {
  if (status === "fail") return 0;
  if (status === "warning") return 1;
  return 2;
}

function priorityPill(priority: string) {
  if (priority === "critical") return "bg-rose-100 text-rose-700";
  if (priority === "high") return "bg-amber-100 text-amber-700";
  if (priority === "medium") return "bg-sky-100 text-sky-700";
  return "bg-emerald-100 text-emerald-700";
}

export function AuditTopicPanel({ checks }: { checks: CheckItem[] }) {
  const [activeTopic, setActiveTopic] = useState("all-suggestions");

  const suggestionsByTopic = useMemo(() => {
    return TOPICS.reduce<Record<string, CheckItem[]>>((acc, topic) => {
      if (topic.id === "all-suggestions") {
        const nonPass = checks.filter((check) => check.status !== "pass");
        const source = nonPass.length > 0 ? nonPass : checks;
        acc[topic.id] = [...source].sort((a, b) => {
          const statusDiff = statusWeight(a.status) - statusWeight(b.status);
          if (statusDiff !== 0) return statusDiff;
          return priorityWeight(a.priority) - priorityWeight(b.priority);
        });
        return acc;
      }

      const scoped = checks.filter((check) => topic.keys.includes(check.key));
      const nonPass = scoped.filter((check) => check.status !== "pass");
      const source = nonPass.length > 0 ? nonPass : scoped;
      acc[topic.id] = [...source].sort((a, b) => {
        const statusDiff = statusWeight(a.status) - statusWeight(b.status);
        if (statusDiff !== 0) return statusDiff;
        return priorityWeight(a.priority) - priorityWeight(b.priority);
      });
      return acc;
    }, {});
  }, [checks]);

  const currentTopic = TOPICS.find((topic) => topic.id === activeTopic) ?? TOPICS[0];
  const currentSuggestions = suggestionsByTopic[currentTopic.id] ?? [];

  return (
    <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,760px)] lg:items-start lg:justify-start">
      <aside className="space-y-3">
        {TOPICS.map((topic) => {
          const Icon = topic.icon;
          const active = topic.id === activeTopic;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => setActiveTopic(topic.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left font-manrope text-lg font-extrabold transition ${
                active
                  ? "bg-[var(--primary)] text-white shadow-[0_14px_26px_rgba(0,22,57,0.2)]"
                  : "bg-transparent text-[var(--on-surface)]/80 hover:bg-[var(--surface-container-low)]"
              }`}
            >
              <Icon size={20} className={active ? "text-white" : "text-[var(--on-surface)]/70"} />
              <span>{topic.label}</span>
            </button>
          );
        })}
      </aside>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <h2 className="font-manrope text-xl font-extrabold">{currentTopic.label} Suggestions</h2>
        <p className="mt-1 text-sm text-[var(--on-surface)]/70">
          Focused suggestions for this area. Start with fail/high items first.
        </p>

        <div className="mt-4 space-y-3">
          {currentSuggestions.length === 0 ? (
            <p className="text-sm text-[var(--on-surface)]/70">No checks found for this section.</p>
          ) : (
            currentSuggestions.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_6%,white)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityPill(item.priority)}`}
                  >
                    {item.priority}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      item.status === "fail"
                        ? "bg-rose-50 text-rose-700"
                        : item.status === "warning"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-[var(--on-surface)]/74">
                  <span className="font-semibold">Fix:</span> {item.recommendation ?? "No recommendation provided."}
                </p>
                <p className="mt-1 text-sm text-[var(--on-surface)]/70">{item.details ?? "No details captured."}</p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
