import { z } from "zod";
import { AUDIT_CHECKLIST, type ChecklistTemplate, type CheckPriority } from "@/lib/seo-checklist";
import { CRO_AUDIT_CHECKLIST } from "@/lib/cro-checklist";

export const CHECK_STATUS_VALUES = ["pass", "fail", "warn", "skipped"] as const;
export const CHECK_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;

export const checkRowSchema = z.object({
  key: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  status: z.enum(CHECK_STATUS_VALUES),
  priority: z.enum(CHECK_PRIORITY_VALUES),
  details: z.string().max(20000).nullable().optional(),
  recommendation: z.string().max(20000).nullable().optional(),
});

export type CheckRow = z.infer<typeof checkRowSchema>;

export const adminAuditUploadSchema = z.object({
  score: z.number().int().min(0).max(100).nullable().optional(),
  summary: z.string().max(20000).nullable().optional(),
  reportMarkdown: z.string().max(200000).nullable().optional(),
  status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional(),
  publish: z.boolean().optional(),
  notifyUser: z.boolean().optional(),
  checks: z.array(checkRowSchema).min(1).max(200),
});

export type AdminAuditUploadPayload = z.infer<typeof adminAuditUploadSchema>;

export type AuditMode = "seo" | "cro";

export function checklistFor(mode: AuditMode): ChecklistTemplate[] {
  return mode === "cro" ? CRO_AUDIT_CHECKLIST : AUDIT_CHECKLIST;
}

export function buildStarterTemplate(mode: AuditMode): {
  score: null;
  summary: string;
  reportMarkdown: string;
  publish: false;
  notifyUser: true;
  checks: Array<{
    key: string;
    title: string;
    status: "skipped";
    priority: CheckPriority;
    details: string;
    recommendation: string;
  }>;
} {
  const checklist = checklistFor(mode);
  return {
    score: null,
    summary: "",
    reportMarkdown: "",
    publish: false,
    notifyUser: true,
    checks: checklist.map((template) => ({
      key: template.key,
      title: template.title,
      status: "skipped",
      priority: template.priority,
      details: "",
      recommendation: "",
    })),
  };
}

export type ValidationError = {
  ok: false;
  error: string;
  missingKeys?: string[];
  unknownKeys?: string[];
  invalid?: Record<string, string[]>;
};

export type ValidationSuccess = {
  ok: true;
  payload: AdminAuditUploadPayload;
  unknownKeys: string[];
};

export function validateUploadPayload(
  raw: unknown,
  mode: AuditMode,
  options: { requireAllKeys?: boolean } = {},
): ValidationError | ValidationSuccess {
  const parsed = adminAuditUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const invalid: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(flat.fieldErrors)) {
      if (messages && messages.length > 0) invalid[field] = messages;
    }
    if (flat.formErrors.length > 0) invalid["_root"] = flat.formErrors;
    return { ok: false, error: "Schema validation failed.", invalid };
  }

  const checklist = checklistFor(mode);
  const knownKeys = new Set(checklist.map((c) => c.key));
  const providedKeys = new Set(parsed.data.checks.map((c) => c.key));

  const missingKeys: string[] = [];
  if (options.requireAllKeys) {
    for (const key of knownKeys) {
      if (!providedKeys.has(key)) missingKeys.push(key);
    }
  }

  const unknownKeys: string[] = [];
  for (const key of providedKeys) {
    if (!knownKeys.has(key)) unknownKeys.push(key);
  }

  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: `Missing ${missingKeys.length} required check key(s) for ${mode.toUpperCase()} audit.`,
      missingKeys,
      unknownKeys,
    };
  }

  return { ok: true, payload: parsed.data, unknownKeys };
}

export function buildSpec() {
  return {
    version: "1.0.0",
    description:
      "Upload schema for completed manual audits. Render the customer dashboard cards by submitting a fully populated checks[] array. status/priority enums are strict.",
    enums: {
      status: CHECK_STATUS_VALUES,
      priority: CHECK_PRIORITY_VALUES,
      auditStatus: ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const,
    },
    fields: {
      score: "integer 0-100, optional, drives the headline donut score",
      summary: "short plain-text summary shown above the executive report",
      reportMarkdown:
        "full markdown executive report shown in the right-hand 'Executive Report (Full)' panel; supports headings, lists, tables",
      checks:
        "array of per-check rows; one row per audit key. Each row produces a card on the customer dashboard.",
      publish: "boolean. true => set status COMPLETED and (optionally) email customer",
      notifyUser: "boolean. when publish=true, controls customer notification email",
      status:
        "optional override of audit status when publish is false (QUEUED|RUNNING|COMPLETED|FAILED)",
    },
    checkRow: {
      key: "stable identifier from the checklist below; uniquely identifies the card",
      title: "human-readable title shown on the card",
      status: "one of pass|fail|warn|skipped (skipped = not assessed/not applicable)",
      priority: "one of critical|high|medium|low; default to template priority unless evidence shifts it",
      details:
        "what was found on the page for this check (markdown allowed). Keep concrete and verifiable.",
      recommendation:
        "concrete next step the customer should take (markdown allowed). One short paragraph or bullet list.",
    },
    rules: [
      "Use ONLY keys from the checklist for the audit mode (seo or cro). Unknown keys will be rejected.",
      "Cover every key for the audit mode. Use status='skipped' if a check truly does not apply.",
      "Statuses: pass (clean), warn (partial/issue but not blocking), fail (blocking issue), skipped (not assessed).",
      "Priorities reflect business impact: critical (revenue/ranking blocking), high, medium, low.",
      "details should reference observed values (current title, H1 text, count, etc). recommendation must be actionable.",
      "Always submit with publish=true when the audit is final and ready to email the customer.",
      "All length caps: title<=500, key<=120, details/recommendation<=20000, reportMarkdown<=200000.",
    ],
    endpoints: {
      list: "GET /api/admin/audits?status=QUEUED&q=<email|url|id>",
      get: "GET /api/admin/audits/{id}",
      uploadHeadless:
        "POST /api/admin/audits/{id}/upload  Authorization: Bearer ADMIN_UPLOAD_TOKEN  body: AdminAuditUploadPayload",
      patchSession: "PATCH /api/admin/audits/{id}  (Clerk admin session)",
      spec: "GET /api/admin/audits/spec?mode=seo|cro",
    },
    checklists: {
      seo: AUDIT_CHECKLIST,
      cro: CRO_AUDIT_CHECKLIST,
    },
    starterTemplates: {
      seo: buildStarterTemplate("seo"),
      cro: buildStarterTemplate("cro"),
    },
  };
}
