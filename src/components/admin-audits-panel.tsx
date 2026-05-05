"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_AUDIT_SECTION_EXAMPLE,
  AUDIT_SECTIONS,
  parseAuditSection,
  type AuditSectionId,
} from "@/lib/audit-text-sections";

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
  initialSelectedId?: string;
};

type SectionState = Record<AuditSectionId, string>;

const EMPTY_SECTIONS: SectionState = {
  "on-page": "",
  "tech-perf": "",
  authority: "",
};

const SECTION_FIELD_NAMES: Record<AuditSectionId, "onPageContent" | "techPerfContent" | "authorityContent"> = {
  "on-page": "onPageContent",
  "tech-perf": "techPerfContent",
  authority: "authorityContent",
};

export function AdminAuditsPanel({ audits: initialAudits = [], initialSelectedId }: AdminAuditsPanelProps) {
  const [audits, setAudits] = useState<AdminAuditItem[]>(initialAudits);
  const [selectedAuditId, setSelectedAuditId] = useState(initialSelectedId ?? initialAudits[0]?.id ?? "");
  const [sections, setSections] = useState<SectionState>({ ...EMPTY_SECTIONS });
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<AdminAuditItem["status"]>("COMPLETED");
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminAuditItem["status"]>("ALL");

  // Keep the browser URL in sync with the currently selected audit so each
  // request has a stable, copy-pasteable admin slug like /dashboard/admin/<id>.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedAuditId) return;
    const desiredPath = `/dashboard/admin/${selectedAuditId}`;
    if (window.location.pathname !== desiredPath) {
      window.history.replaceState(window.history.state, "", desiredPath + window.location.search + window.location.hash);
    }
  }, [selectedAuditId]);

  const selectedAudit = useMemo(
    () => audits.find((a) => a.id === selectedAuditId) ?? null,
    [audits, selectedAuditId],
  );

  const sectionStats = useMemo(() => {
    const result: Record<AuditSectionId, { items: number; chars: number }> = {
      "on-page": { items: 0, chars: 0 },
      "tech-perf": { items: 0, chars: 0 },
      authority: { items: 0, chars: 0 },
    };
    for (const section of AUDIT_SECTIONS) {
      const text = sections[section.id];
      result[section.id] = {
        items: parseAuditSection(text, section.id).length,
        chars: text.length,
      };
    }
    return result;
  }, [sections]);

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
          if (current) return current;
          if (data.audits!.length === 0) return "";
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
          summary: string | null;
          onPageContent: string | null;
          techPerfContent: string | null;
          authorityContent: string | null;
        };
        error?: string;
      };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to load audit.");
        return;
      }
      if (data.audit) {
        setStatus(data.audit.status);
        setSummary(data.audit.summary ?? "");
        setSections({
          "on-page": data.audit.onPageContent ?? "",
          "tech-perf": data.audit.techPerfContent ?? "",
          authority: data.audit.authorityContent ?? "",
        });
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

  const updateSection = useCallback((id: AuditSectionId, value: string) => {
    setSections((prev) => ({ ...prev, [id]: value }));
  }, []);

  const insertExample = useCallback((id: AuditSectionId) => {
    setSections((prev) => ({ ...prev, [id]: ADMIN_AUDIT_SECTION_EXAMPLE[id] }));
  }, []);

  async function patchAudit(payload: Record<string, unknown>) {
    if (!selectedAuditId) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/audits/${selectedAuditId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      // Surface real error bodies (including non-JSON HTML responses from
      // middleware redirects) so we don't drop them as "Request failed."
      const rawText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }
      if (!response.ok) {
        const message =
          (parsed && typeof parsed.error === "string" ? parsed.error : null) ??
          (rawText && rawText.length < 400 ? rawText : `HTTP ${response.status}`);
        setMessage(`Save failed: ${message}`);
        return;
      }
      const email = parsed?.email as { sent?: boolean; reason?: string; detail?: string } | null | undefined;
      const emailNote =
        email && typeof email === "object" && "sent" in email
          ? email.sent
            ? " Customer email sent."
            : ` Customer email NOT sent (${email.detail ?? email.reason ?? "unknown"}).`
          : "";
      setMessage(`Saved.${emailNote}`);
      await refreshList();
      await loadSelectedAudit(selectedAuditId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error.";
      setMessage(`Request failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function buildBasePayload() {
    return {
      summary: summary.trim() ? summary : null,
      status,
      onPageContent: sections["on-page"],
      techPerfContent: sections["tech-perf"],
      authorityContent: sections.authority,
    };
  }

  async function saveDraft() {
    await patchAudit({ ...buildBasePayload(), saveDraft: true, notifyUser: false });
  }

  async function publish() {
    await patchAudit({ ...buildBasePayload(), publish: true, notifyUser });
  }

  async function saveStatusOnly() {
    await patchAudit({ ...buildBasePayload(), notifyUser: false });
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
            {audits.map((audit) => {
              const adminUrl = `/dashboard/admin/${audit.id}`;
              const isSelected = selectedAuditId === audit.id;
              return (
                <div
                  key={audit.id}
                  className={`rounded-xl border px-4 py-3 transition ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--surface-container-low)]"
                      : "border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAuditId(audit.id)}
                    className="block w-full text-left"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/60">
                      {audit.status}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{audit.email}</p>
                    <p className="mt-1 truncate text-sm text-[var(--on-surface)]/75">{audit.targetUrl}</p>
                    <p className="mt-1 text-xs text-[var(--on-surface)]/60">{audit.targetKeyword}</p>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[color:color-mix(in_oklab,var(--primary)_8%,white)] pt-2">
                    <a
                      href={adminUrl}
                      className="text-[11px] font-bold uppercase tracking-wide text-[var(--primary)] hover:underline"
                    >
                      Open admin link
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const fullUrl =
                          typeof window !== "undefined" ? `${window.location.origin}${adminUrl}` : adminUrl;
                        void navigator.clipboard?.writeText(fullUrl);
                        setMessage(`Copied admin URL for ${audit.email}.`);
                      }}
                      className="text-[11px] font-bold uppercase tracking-wide text-[var(--on-surface)]/65 hover:text-[var(--primary)]"
                    >
                      Copy URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(audit.id);
                        setMessage(`Copied audit ID ${audit.id}.`);
                      }}
                      className="text-[11px] font-bold uppercase tracking-wide text-[var(--on-surface)]/65 hover:text-[var(--primary)]"
                    >
                      Copy ID
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="order-1 rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-5 shadow-[0_12px_40px_rgba(0,22,57,0.06)] lg:order-1">
          <h2 className="font-manrope text-xl font-extrabold">Upload Completed Audit</h2>
          {selectedAudit ? (
            <p className="mt-2 text-xs text-[var(--on-surface)]/65">
              {selectedAudit.email} • <span className="break-all">{selectedAudit.targetUrl}</span>
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Audit ID</span>
                <input
                  value={selectedAuditId}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  onFocus={(e) => e.currentTarget.select()}
                  title="Locked to the selected audit. Open a different audit via its admin URL or the Pending list to change."
                  className="mt-1 w-full cursor-default select-all rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface-container-low)] px-3 py-2 font-mono text-xs text-[var(--on-surface)]/85"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Status</span>
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
            </div>
            {isLoadingAudit ? <p className="text-xs text-[var(--on-surface)]/60">Loading audit fields…</p> : null}
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Summary (optional)</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
            <p className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2 text-xs text-[var(--on-surface)]/70">
              Paste each section below. Each block uses{" "}
              <code className="rounded bg-[var(--surface)] px-1">**Item: Title**</code> entries with{" "}
              <code className="rounded bg-[var(--surface)] px-1">- Current state:</code>,{" "}
              <code className="rounded bg-[var(--surface)] px-1">- Analysis:</code>, and{" "}
              <code className="rounded bg-[var(--surface)] px-1">- Status:</code> lines.
            </p>
            {AUDIT_SECTIONS.map((section) => {
              const stats = sectionStats[section.id];
              return (
                <div key={section.id} className="rounded-xl border border-[color:color-mix(in_oklab,var(--primary)_8%,white)] bg-[var(--surface)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-manrope text-sm font-extrabold text-[var(--primary)]">{section.label}</p>
                      <p className="text-[11px] text-[var(--on-surface)]/60">
                        {stats.items} item{stats.items === 1 ? "" : "s"} parsed • {stats.chars.toLocaleString()} chars
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => insertExample(section.id)}
                      className="rounded-lg border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface-container-lowest)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]"
                    >
                      Insert example
                    </button>
                  </div>
                  <textarea
                    value={sections[section.id]}
                    onChange={(e) => updateSection(section.id, e.target.value)}
                    rows={14}
                    spellCheck={false}
                    placeholder={`**Item: <Title>**\n- Current state: ...\n- Analysis: ...\n- Status: Good | Needs Improvement | Critical`}
                    className="mt-2 w-full rounded-lg border border-[color:color-mix(in_oklab,var(--primary)_12%,white)] bg-[var(--surface-container-lowest)] px-3 py-2 font-mono text-xs"
                    name={SECTION_FIELD_NAMES[section.id]}
                  />
                </div>
              );
            })}
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
                onClick={() => void publish()}
                disabled={isSaving || !selectedAuditId}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {isSaving ? "Publishing..." : "Publish"}
              </button>
              <button
                type="button"
                onClick={() => void saveStatusOnly()}
                disabled={isSaving || !selectedAuditId}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--surface-container-low)] px-4 py-2.5 text-sm font-bold text-[var(--primary)] disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save status only"}
              </button>
            </div>
            {message ? <p className="text-sm text-[var(--on-surface)]/75">{message}</p> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
