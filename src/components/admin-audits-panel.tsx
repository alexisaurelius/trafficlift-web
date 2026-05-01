"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AUDIT_CHECKLIST, type CheckPriority } from "@/lib/seo-checklist";
import { CRO_AUDIT_CHECKLIST } from "@/lib/cro-checklist";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
import {
  CHECK_PRIORITY_VALUES,
  CHECK_STATUS_VALUES,
  buildStarterTemplate,
} from "@/lib/admin-audit-upload";

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
  const [uploadMode, setUploadMode] = useState<"form" | "json">("form");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonStatus, setJsonStatus] = useState<{ type: "ok" | "error" | "info"; message: string } | null>(null);

  const selectedAudit = useMemo(
    () => audits.find((a) => a.id === selectedAuditId) ?? null,
    [audits, selectedAuditId],
  );
  const selectedMode: "seo" | "cro" = useMemo(
    () => (selectedAudit ? auditTypeFromKeyword(selectedAudit.targetKeyword) : "seo"),
    [selectedAudit],
  );
  const checklistForSelected = selectedMode === "cro" ? CRO_AUDIT_CHECKLIST : AUDIT_CHECKLIST;

  const insertStarterTemplate = useCallback(
    (mode: "seo" | "cro") => {
      const template = buildStarterTemplate(mode);
      setJsonInput(JSON.stringify(template, null, 2));
      setJsonStatus({
        type: "info",
        message: `${mode.toUpperCase()} starter template loaded — ${template.checks.length} keys. Fill status / details / recommendation for each.`,
      });
    },
    [],
  );

  const parseJsonPayload = useCallback((): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } => {
    if (!jsonInput.trim()) {
      return { ok: false, message: "JSON is empty." };
    }
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, message: "Top-level JSON must be an object." };
      }
      return { ok: true, data: parsed as Record<string, unknown> };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON.";
      return { ok: false, message: `Parse error: ${message}` };
    }
  }, [jsonInput]);

  const validateJsonLocally = useCallback(() => {
    const parsed = parseJsonPayload();
    if (!parsed.ok) {
      setJsonStatus({ type: "error", message: parsed.message });
      return null;
    }
    const data = parsed.data;
    const checks = data.checks;
    if (!Array.isArray(checks) || checks.length === 0) {
      setJsonStatus({ type: "error", message: "checks[] is required and must be a non-empty array." });
      return null;
    }
    const validStatuses: readonly string[] = CHECK_STATUS_VALUES;
    const validPriorities: readonly string[] = CHECK_PRIORITY_VALUES;
    const errors: string[] = [];
    const knownKeys = new Set(checklistForSelected.map((c) => c.key));
    const seen = new Set<string>();
    checks.forEach((row, idx) => {
      if (!row || typeof row !== "object") {
        errors.push(`checks[${idx}]: not an object`);
        return;
      }
      const r = row as Record<string, unknown>;
      if (typeof r.key !== "string" || !r.key) errors.push(`checks[${idx}].key missing`);
      if (typeof r.title !== "string" || !r.title) errors.push(`checks[${idx}].title missing`);
      if (typeof r.status !== "string" || !validStatuses.includes(r.status))
        errors.push(`checks[${idx}].status must be one of ${validStatuses.join("|")}`);
      if (typeof r.priority !== "string" || !validPriorities.includes(r.priority))
        errors.push(`checks[${idx}].priority must be one of ${validPriorities.join("|")}`);
      if (typeof r.key === "string") {
        if (seen.has(r.key)) errors.push(`checks[${idx}].key duplicated: ${r.key}`);
        seen.add(r.key);
      }
    });
    const missing: string[] = [];
    for (const k of knownKeys) if (!seen.has(k)) missing.push(k);
    const unknown = [...seen].filter((k) => !knownKeys.has(k));
    if (errors.length > 0 || missing.length > 0) {
      const parts = [...errors];
      if (missing.length > 0) parts.push(`Missing keys (${selectedMode.toUpperCase()}): ${missing.join(", ")}`);
      if (unknown.length > 0) parts.push(`Unknown keys: ${unknown.join(", ")}`);
      setJsonStatus({ type: "error", message: parts.join(" | ") });
      return null;
    }
    setJsonStatus({
      type: "ok",
      message: `Valid. ${checks.length} checks for ${selectedMode.toUpperCase()}${unknown.length > 0 ? ` (${unknown.length} extra preserved)` : ""}.`,
    });
    return data;
  }, [parseJsonPayload, checklistForSelected, selectedMode]);

  const applyJsonToFormFields = useCallback(() => {
    const data = validateJsonLocally();
    if (!data) return;
    const checks = (data.checks as Array<Record<string, unknown>>) ?? [];
    const nextManual = buildDefaultManualChecks();
    const preserved: ExistingAuditCheck[] = [];
    for (const check of checks) {
      const key = String(check.key ?? "");
      const title = String(check.title ?? key);
      const statusValue = String(check.status ?? "skipped");
      const priorityValue = String(check.priority ?? "medium");
      const details = check.details === null || check.details === undefined ? "" : String(check.details);
      const recommendation =
        check.recommendation === null || check.recommendation === undefined ? "" : String(check.recommendation);
      if (MANUAL_KEY_SET.has(key)) {
        const template = MANUAL_TEMPLATES.find((t) => t.key === key);
        nextManual[key] = {
          status: coerceStatus(statusValue),
          priority: coercePriority(priorityValue, template?.defaultPriority ?? "medium"),
          details,
          recommendation,
        };
      } else {
        preserved.push({
          id: `pasted-${key}`,
          key,
          title,
          status: statusValue,
          priority: priorityValue,
          details: details || null,
          recommendation: recommendation || null,
        });
      }
    }
    setManualChecks(nextManual);
    setOtherChecks(preserved);
    setIncludeManualChecks(true);
    if (typeof data.score === "number") setScore(String(data.score));
    if (data.score === null) setScore("");
    if (typeof data.summary === "string") setSummary(data.summary);
    if (typeof data.reportMarkdown === "string") setReportMarkdown(data.reportMarkdown);
    if (typeof data.status === "string") {
      const normalized = data.status as AdminAuditItem["status"];
      if (normalized === "QUEUED" || normalized === "RUNNING" || normalized === "COMPLETED" || normalized === "FAILED") {
        setStatus(normalized);
      }
    }
    setUploadMode("form");
    setMessage("Applied JSON to form fields. Review and click Publish.");
  }, [validateJsonLocally]);

  async function patchFromJson(opts: { publish: boolean }) {
    if (!selectedAuditId) {
      setJsonStatus({ type: "error", message: "Select an audit first." });
      return;
    }
    const data = validateJsonLocally();
    if (!data) return;
    const payload: Record<string, unknown> = {
      reportMarkdown: typeof data.reportMarkdown === "string" ? data.reportMarkdown : "",
      summary: typeof data.summary === "string" ? data.summary : null,
      score: typeof data.score === "number" ? data.score : null,
      checks: data.checks,
      notifyUser: opts.publish ? notifyUser : false,
    };
    if (opts.publish) {
      payload.publish = true;
    } else {
      payload.saveDraft = true;
    }
    await patchAudit(payload);
  }

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
      <section className="grid gap-5 lg:grid-cols-[2.2fr_1fr]">
      <article className="order-2 rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)] lg:order-2">
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

      <article className="order-1 rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)] lg:order-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-manrope text-xl font-extrabold">Upload Completed Audit</h2>
          <div className="inline-flex rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setUploadMode("form")}
              className={`rounded-lg px-3 py-1.5 transition ${
                uploadMode === "form" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"
              }`}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => setUploadMode("json")}
              className={`rounded-lg px-3 py-1.5 transition ${
                uploadMode === "json" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"
              }`}
            >
              Paste JSON (AI)
            </button>
          </div>
        </div>
        {selectedAudit ? (
          <p className="mt-2 text-xs text-[var(--on-surface)]/65">
            <span className="font-semibold uppercase tracking-wide text-[var(--primary)]">{selectedMode}</span>{" "}
            audit • {selectedAudit.email} • <span className="break-all">{selectedAudit.targetUrl}</span>
          </p>
        ) : null}
        {uploadMode === "json" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => insertStarterTemplate(selectedMode)}
                className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]"
              >
                Insert {selectedMode.toUpperCase()} starter template
              </button>
              <button
                type="button"
                onClick={() => insertStarterTemplate(selectedMode === "seo" ? "cro" : "seo")}
                className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]"
              >
                Switch to {selectedMode === "seo" ? "CRO" : "SEO"} template
              </button>
              <a
                href={`/api/admin/audits/spec?mode=${selectedMode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]"
              >
                Open spec
              </a>
            </div>
            <p className="text-xs text-[var(--on-surface)]/65">
              The AI agent should POST this JSON to{" "}
              <code className="rounded bg-[var(--surface-container-low)] px-1">
                /api/admin/audits/{selectedAuditId || "{id}"}/upload
              </code>{" "}
              with header{" "}
              <code className="rounded bg-[var(--surface-container-low)] px-1">
                Authorization: Bearer ADMIN_UPLOAD_TOKEN
              </code>
              . Or paste below and click Publish.
            </p>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={22}
              spellCheck={false}
              placeholder='{ "score": 72, "summary": "...", "reportMarkdown": "...", "checks": [ ... ] }'
              className="w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 font-mono text-xs"
            />
            {jsonStatus ? (
              <p
                className={`text-xs ${
                  jsonStatus.type === "error"
                    ? "text-rose-700"
                    : jsonStatus.type === "ok"
                      ? "text-emerald-700"
                      : "text-[var(--on-surface)]/70"
                }`}
              >
                {jsonStatus.message}
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-[var(--on-surface)]/78">
              <input type="checkbox" checked={notifyUser} onChange={(e) => setNotifyUser(e.target.checked)} />
              Email customer when publishing
            </label>
            <div className="grid gap-2 md:grid-cols-4">
              <button
                type="button"
                onClick={() => validateJsonLocally()}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--primary)]"
              >
                Validate
              </button>
              <button
                type="button"
                onClick={() => applyJsonToFormFields()}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--primary)]"
              >
                Apply to fields
              </button>
              <button
                type="button"
                onClick={() => void patchFromJson({ publish: false })}
                disabled={isSaving || !selectedAuditId}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => void patchFromJson({ publish: true })}
                disabled={isSaving || !selectedAuditId}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {isSaving ? "Publishing..." : "Publish"}
              </button>
            </div>
            {message ? <p className="text-sm text-[var(--on-surface)]/75">{message}</p> : null}
          </div>
        ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Audit ID</span>
              <input
                value={selectedAuditId}
                onChange={(e) => setSelectedAuditId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Advanced status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AdminAuditItem["status"])}
                className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <option value="COMPLETED">COMPLETED</option>
                <option value="RUNNING">RUNNING</option>
                <option value="QUEUED">QUEUED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Score (optional)</span>
              <input
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="0-100"
                className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          {isLoadingAudit ? <p className="text-xs text-[var(--on-surface)]/60">Loading audit fields…</p> : null}
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Summary (optional)</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Report Markdown</span>
            <textarea
              value={reportMarkdown}
              onChange={(e) => setReportMarkdown(e.target.value)}
              rows={20}
              className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--on-surface)]/78">
            <input type="checkbox" checked={notifyUser} onChange={(e) => setNotifyUser(e.target.checked)} />
            Email customer when publishing
          </label>
          <div className="grid gap-2 md:grid-cols-3">
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
            <button
              type="button"
              onClick={() => void saveAdvanced()}
              disabled={isSaving || !selectedAuditId}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--surface-container-low)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save status only"}
            </button>
          </div>
          {message ? <p className="text-sm text-[var(--on-surface)]/75">{message}</p> : null}
        </div>
        )}
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
