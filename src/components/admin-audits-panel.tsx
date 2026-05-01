"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AUDIT_CHECKLIST, type CheckPriority } from "@/lib/seo-checklist";

type AdminAuditItem = {
  id: string;
  email: string;
  targetUrl: string;
  targetKeyword: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  createdAt: string;
};

type AdminAuditsPanelProps = {
  audits?: AdminAuditItem[];
};

type ManualCheckStatus = "pass" | "fail" | "warn" | "skipped";

type ManualCheckRow = {
  status: ManualCheckStatus;
  priority: CheckPriority;
  details: string;
  recommendation: string;
};

type ExistingAuditCheck = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  details: string | null;
  recommendation: string | null;
};

const MANUAL_UPLOAD_KEYS = [
  "title-tag",
  "meta-description",
  "h1-count",
  "h2-keyword",
  "heading-hierarchy",
  "structured-data",
  "schema-coverage",
  "canonical",
  "canonical-consistency",
  "indexability-controls",
  "http-status-chain",
  "hreflang",
  "sitemap",
  "robots",
  "social-tags",
  "twitter-card-coverage",
  "alt-text",
  "image-performance",
  "internal-linking",
  "internal-links-health",
  "render-blocking-resources",
  "asset-caching-compression",
  "duplicate-metadata",
] as const;

const MANUAL_KEY_SET = new Set<string>(MANUAL_UPLOAD_KEYS);

const STATUS_OPTIONS: ManualCheckStatus[] = ["skipped", "pass", "warn", "fail"];
const PRIORITY_OPTIONS: CheckPriority[] = ["critical", "high", "medium", "low"];

type ManualTemplate = {
  key: string;
  title: string;
  defaultPriority: CheckPriority;
  description: string;
};

const MANUAL_TEMPLATES: ManualTemplate[] = MANUAL_UPLOAD_KEYS.map((key) => {
  const template = AUDIT_CHECKLIST.find((entry) => entry.key === key);
  if (!template) {
    throw new Error(`Missing checklist template for manual key: ${key}`);
  }
  return {
    key: template.key,
    title: template.title,
    defaultPriority: template.priority,
    description: template.description,
  };
});

function buildDefaultManualChecks(): Record<string, ManualCheckRow> {
  const next: Record<string, ManualCheckRow> = {};
  for (const template of MANUAL_TEMPLATES) {
    next[template.key] = {
      status: "skipped",
      priority: template.defaultPriority,
      details: "",
      recommendation: "",
    };
  }
  return next;
}

function coerceStatus(value: string): ManualCheckStatus {
  return (STATUS_OPTIONS as string[]).includes(value) ? (value as ManualCheckStatus) : "skipped";
}

function coercePriority(value: string, fallback: CheckPriority): CheckPriority {
  return (PRIORITY_OPTIONS as string[]).includes(value) ? (value as CheckPriority) : fallback;
}

export function AdminAuditsPanel({ audits: initialAudits = [] }: AdminAuditsPanelProps) {
  const [audits, setAudits] = useState<AdminAuditItem[]>(initialAudits);
  const [selectedAuditId, setSelectedAuditId] = useState(initialAudits[0]?.id ?? "");
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [summary, setSummary] = useState("");
  const [score, setScore] = useState("");
  const [status, setStatus] = useState<AdminAuditItem["status"]>("COMPLETED");
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminAuditItem["status"]>("ALL");
  const [manualChecks, setManualChecks] = useState<Record<string, ManualCheckRow>>(() => buildDefaultManualChecks());
  const [otherChecks, setOtherChecks] = useState<ExistingAuditCheck[]>([]);
  const [includeManualChecks, setIncludeManualChecks] = useState(false);
  const [showManualChecks, setShowManualChecks] = useState(true);

  const updateManualCheck = useCallback(
    (key: string, partial: Partial<ManualCheckRow>) => {
      setManualChecks((prev) => {
        const current = prev[key];
        if (!current) return prev;
        return { ...prev, [key]: { ...current, ...partial } };
      });
      setIncludeManualChecks(true);
    },
    [],
  );

  const resetManualCheck = useCallback((key: string) => {
    const template = MANUAL_TEMPLATES.find((t) => t.key === key);
    if (!template) return;
    setManualChecks((prev) => ({
      ...prev,
      [key]: {
        status: "skipped",
        priority: template.defaultPriority,
        details: "",
        recommendation: "",
      },
    }));
    setIncludeManualChecks(true);
  }, []);

  const buildChecksPayload = useCallback(() => {
    const manual = MANUAL_TEMPLATES.map((template) => {
      const row = manualChecks[template.key];
      return {
        key: template.key,
        title: template.title,
        status: row.status,
        priority: row.priority,
        details: row.details.trim() ? row.details : null,
        recommendation: row.recommendation.trim() ? row.recommendation : null,
      };
    });
    const preserved = otherChecks.map((check) => ({
      key: check.key,
      title: check.title,
      status: coerceStatus(check.status),
      priority: coercePriority(check.priority, "medium"),
      details: check.details,
      recommendation: check.recommendation,
    }));
    return [...manual, ...preserved];
  }, [manualChecks, otherChecks]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    params.set("limit", "100");
    return params.toString();
  }, [query, statusFilter]);

  const refreshList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const response = await fetch(`/api/admin/audits?${queryString}`, { cache: "no-store" });
      const data = (await response.json()) as { audits?: AdminAuditItem[]; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to load audits.");
        return;
      }
      if (Array.isArray(data.audits)) {
        setAudits(data.audits);
        setSelectedAuditId((current) => {
          if (data.audits!.length === 0) return "";
          if (current && data.audits!.some((a) => a.id === current)) return current;
          return data.audits![0].id;
        });
      }
    } catch {
      setMessage("Failed to load audits.");
    } finally {
      setIsLoadingList(false);
    }
  }, [queryString]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const loadSelectedAudit = useCallback(async (auditId: string) => {
    if (!auditId) return;
    setIsLoadingAudit(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/audits/${auditId}`, { cache: "no-store" });
      const data = (await response.json()) as {
        audit?: {
          id: string;
          status: AdminAuditItem["status"];
          reportMarkdown: string | null;
          summary: string | null;
          score: number | null;
          checks?: ExistingAuditCheck[];
        };
        error?: string;
      };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to load audit.");
        return;
      }
      if (data.audit) {
        setStatus(data.audit.status);
        setReportMarkdown(data.audit.reportMarkdown ?? "");
        setSummary(data.audit.summary ?? "");
        setScore(data.audit.score === null || data.audit.score === undefined ? "" : String(data.audit.score));

        const existingChecks = Array.isArray(data.audit.checks) ? data.audit.checks : [];
        const nextManual = buildDefaultManualChecks();
        const preserved: ExistingAuditCheck[] = [];
        for (const check of existingChecks) {
          if (MANUAL_KEY_SET.has(check.key)) {
            const template = MANUAL_TEMPLATES.find((t) => t.key === check.key);
            nextManual[check.key] = {
              status: coerceStatus(check.status),
              priority: coercePriority(check.priority, template?.defaultPriority ?? "medium"),
              details: check.details ?? "",
              recommendation: check.recommendation ?? "",
            };
          } else {
            preserved.push(check);
          }
        }
        setManualChecks(nextManual);
        setOtherChecks(preserved);
        setIncludeManualChecks(existingChecks.length > 0);
      }
    } catch {
      setMessage("Failed to load audit.");
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAuditId) return;
    void loadSelectedAudit(selectedAuditId);
  }, [selectedAuditId, loadSelectedAudit]);

  async function patchAudit(payload: Record<string, unknown>) {
    if (!selectedAuditId) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/audits/${selectedAuditId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to save audit.");
      } else {
        const email = data.email as { sent?: boolean; reason?: string } | null | undefined;
        const emailNote =
          email && typeof email === "object" && "sent" in email
            ? email.sent
              ? " Customer email sent."
              : ` Customer email skipped (${email.reason ?? "unknown"}).`
            : "";
        setMessage(`Saved.${emailNote}`);
        await refreshList();
        await loadSelectedAudit(selectedAuditId);
      }
    } catch {
      setMessage("Request failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function withChecks(payload: Record<string, unknown>) {
    if (!includeManualChecks) return payload;
    return { ...payload, checks: buildChecksPayload() };
  }

  async function saveDraft() {
    await patchAudit(
      withChecks({
        reportMarkdown,
        summary: summary || null,
        score: score === "" ? null : Number(score),
        saveDraft: true,
        notifyUser: false,
      }),
    );
  }

  async function publishAudit() {
    await patchAudit(
      withChecks({
        reportMarkdown,
        summary: summary || null,
        score: score === "" ? null : Number(score),
        publish: true,
        notifyUser,
      }),
    );
  }

  async function saveAdvanced() {
    await patchAudit(
      withChecks({
        reportMarkdown,
        summary: summary || null,
        score: score === "" ? null : Number(score),
        status,
        notifyUser: false,
      }),
    );
  }

  async function saveManualChecksOnly() {
    await patchAudit({
      reportMarkdown,
      summary: summary || null,
      score: score === "" ? null : Number(score),
      status,
      notifyUser: false,
      checks: buildChecksPayload(),
    });
    setIncludeManualChecks(true);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <h2 className="font-manrope text-xl font-extrabold">Pending / Recent Requests</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email, URL, keyword, or audit id"
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm md:w-[180px]"
          >
            <option value="ALL">All statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-[var(--on-surface)]/60">
          {isLoadingList ? "Loading…" : `${audits.length} result(s)`}
        </p>
        <div className="mt-4 space-y-3">
          {audits.map((audit) => (
            <button
              key={audit.id}
              type="button"
              onClick={() => setSelectedAuditId(audit.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                selectedAuditId === audit.id
                  ? "border-[var(--primary)] bg-[var(--surface-container-low)]"
                  : "border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/60">{audit.status}</p>
              <p className="mt-1 text-sm font-semibold">{audit.email}</p>
              <p className="mt-1 truncate text-sm text-[var(--on-surface)]/75">{audit.targetUrl}</p>
              <p className="mt-1 text-xs text-[var(--on-surface)]/60">{audit.targetKeyword}</p>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <h2 className="font-manrope text-xl font-extrabold">Upload Completed Audit</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Audit ID</label>
          <input
            value={selectedAuditId}
            onChange={(e) => setSelectedAuditId(e.target.value)}
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <p className="text-xs text-[var(--on-surface)]/60">{isLoadingAudit ? "Loading audit fields…" : null}</p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Advanced status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminAuditItem["status"])}
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="COMPLETED">COMPLETED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="QUEUED">QUEUED</option>
            <option value="FAILED">FAILED</option>
          </select>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Score (optional)</label>
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="0-100"
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Summary (optional)</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Report Markdown</label>
          <textarea
            value={reportMarkdown}
            onChange={(e) => setReportMarkdown(e.target.value)}
            rows={12}
            className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--on-surface)]/78">
            <input type="checkbox" checked={notifyUser} onChange={(e) => setNotifyUser(e.target.checked)} />
            Email customer when publishing
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={isSaving || !selectedAuditId}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => void publishAudit()}
              disabled={isSaving || !selectedAuditId}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {isSaving ? "Publishing..." : "Publish"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void saveAdvanced()}
            disabled={isSaving || !selectedAuditId}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--surface-container-low)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save advanced status only"}
          </button>
          {message ? <p className="text-sm text-[var(--on-surface)]/75">{message}</p> : null}
        </div>
      </article>
      </section>

      <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-manrope text-xl font-extrabold">Manual Checks</h2>
            <p className="mt-1 text-sm text-[var(--on-surface)]/70">
              Upload <span className="font-semibold">priority</span>, <span className="font-semibold">status</span>,{" "}
              <span className="font-semibold">details</span>, and <span className="font-semibold">recommendation</span> for each of the{" "}
              {MANUAL_TEMPLATES.length} SEO/CRO checks below.
              {otherChecks.length > 0 ? (
                <>
                  {" "}
                  <span className="text-[var(--on-surface)]/55">
                    ({otherChecks.length} additional check{otherChecks.length === 1 ? "" : "s"} for other keys will be preserved.)
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManualChecks((v) => !v)}
            className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]"
          >
            {showManualChecks ? "Hide editor" : "Show editor"}
          </button>
        </header>

        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--on-surface)]/78">
          <input
            type="checkbox"
            checked={includeManualChecks}
            onChange={(e) => setIncludeManualChecks(e.target.checked)}
          />
          Save manual checks alongside Save draft / Publish / Save advanced status only
        </label>

        {showManualChecks ? (
          <div className="mt-4 space-y-3">
            {MANUAL_TEMPLATES.map((template) => {
              const row = manualChecks[template.key];
              if (!row) return null;
              return (
                <div
                  key={template.key}
                  className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">
                        {template.key}
                      </p>
                      <h3 className="mt-0.5 font-manrope text-base font-extrabold text-[var(--primary)]">
                        {template.title}
                      </h3>
                      <p className="mt-1 text-xs text-[var(--on-surface)]/65">{template.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetManualCheck(template.key)}
                      className="shrink-0 rounded-lg border border-[color:color-mix(in_oklab,var(--primary)_10%,white)] bg-[var(--surface-container-lowest)] px-2.5 py-1 text-[11px] font-semibold text-[var(--on-surface)]/70"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                      Priority
                      <select
                        value={row.priority}
                        onChange={(e) =>
                          updateManualCheck(template.key, { priority: e.target.value as CheckPriority })
                        }
                        className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--on-surface)]"
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                      Status
                      <select
                        value={row.status}
                        onChange={(e) =>
                          updateManualCheck(template.key, { status: e.target.value as ManualCheckStatus })
                        }
                        className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--on-surface)]"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                    Details
                    <textarea
                      value={row.details}
                      onChange={(e) => updateManualCheck(template.key, { details: e.target.value })}
                      rows={3}
                      placeholder="What was found on the page for this check."
                      className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--on-surface)]"
                    />
                  </label>

                  <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                    Recommendation
                    <textarea
                      value={row.recommendation}
                      onChange={(e) => updateManualCheck(template.key, { recommendation: e.target.value })}
                      rows={3}
                      placeholder="Concrete next step the customer should take."
                      className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--on-surface)]"
                    />
                  </label>
                </div>
              );
            })}

            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void saveManualChecksOnly()}
                disabled={isSaving || !selectedAuditId}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save manual checks only"}
              </button>
              <p className="text-xs text-[var(--on-surface)]/60 md:text-right md:self-center">
                Tip: keep the checkbox above enabled to save manual checks together with Save draft / Publish.
              </p>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
