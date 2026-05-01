# AI Audit Uploader Spec (v1.0.0)

This document is the canonical instruction set for the AI agent that uploads completed manual audits into TrafficLift. The agent should treat this file as part of its system prompt.

## Goal

For each pending audit (`status = QUEUED` or `RUNNING`), produce a complete `AuditUploadPayload` JSON and POST it to the headless upload endpoint. The customer dashboard renders directly from `checks[]`, so JSON quality is what the customer sees.

## Endpoints

| Purpose | Method | Path |
| --- | --- | --- |
| List pending audits | GET | `/api/admin/audits?status=QUEUED&limit=50` |
| Read one audit | GET | `/api/admin/audits/{id}` |
| Schema + checklist + starter template | GET | `/api/admin/audits/spec?mode=seo` or `?mode=cro` |
| **Upload completed audit (headless)** | **POST** | **`/api/admin/audits/{id}/upload`** |
| Session-mode upload (admin UI) | PATCH | `/api/admin/audits/{id}` |

### Authentication for headless upload

```
Authorization: Bearer ${ADMIN_UPLOAD_TOKEN}
Content-Type: application/json
```

`ADMIN_UPLOAD_TOKEN` is a server-only secret. Do not expose it client-side.

## Payload schema

```jsonc
{
  "score": 72,                       // integer 0-100, required for headline donut
  "summary": "One-line plain text",  // optional, shown above executive report
  "reportMarkdown": "# Executive ...", // optional but strongly recommended (full markdown)
  "publish": true,                   // true => COMPLETED status, optional customer email
  "notifyUser": true,                // when publish=true, send customer email; default true
  "checks": [
    {
      "key": "title-tag",
      "title": "Title Tag",
      "status": "fail",              // pass | fail | warn | skipped
      "priority": "critical",        // critical | high | medium | low
      "details": "Current title: \"…\". Missing keyword.",
      "recommendation": "Rewrite as: …"
    }
    // … one row per checklist key for the audit mode
  ]
}
```

### Determining audit mode

`auditTypeFromKeyword(targetKeyword)`:

- `targetKeyword === "__cro_audit__"` → mode is **`cro`**, use `CRO_AUDIT_CHECKLIST`.
- Otherwise → mode is **`seo`**, use `AUDIT_CHECKLIST`.

The headless POST endpoint validates the mode automatically. Always cover **every key** for that mode.

### Statuses

- `pass` — check is clean.
- `warn` — partial issue, not blocking.
- `fail` — blocking issue that hurts ranking/conversion.
- `skipped` — check truly does not apply (e.g. hreflang for a single-locale site). Avoid skipping in bulk; the user paid for an audit.

### Priorities

- `critical` — revenue/ranking is bleeding right now. Fix today.
- `high` — meaningful business impact within weeks.
- `medium` — quality issue worth scheduling.
- `low` — polish.

Default to the template priority unless evidence shifts it (e.g. a normally `low` check is `critical` for this specific page).

### `details` and `recommendation`

- `details`: what was found. Reference observed values: current title text, H1 text, redirect chain length, schema types present, canonical URL, etc. Customer must be able to verify it on their own page.
- `recommendation`: one short paragraph or bullet list. Concrete and actionable: "Rewrite the H1 to include 'best CRM for startups'. Keep under 70 characters." Avoid vague advice.
- Both support markdown.
- Length cap: 20 000 characters per field.

### `reportMarkdown`

This is the long-form executive report rendered in the right-hand panel. Recommended structure:

```
# Executive Summary
1-2 paragraph overview tied to the score.

## Top 3 issues to fix this week
1. …
2. …
3. …

## What's working
- …

## SEO / CRO breakdown by topic
…

## Suggested 30/60/90 plan
…
```

Length cap: 200 000 characters.

## Workflow for the agent

1. Poll `GET /api/admin/audits?status=QUEUED&limit=20`.
2. For each audit, read `targetUrl` and `targetKeyword`.
3. Fetch the page (or use existing tools) and run the audit.
4. Fetch the spec/template: `GET /api/admin/audits/spec?mode=seo` (or `cro`).
5. Build the payload using the starter template as the skeleton — every checklist key must appear.
6. POST to `/api/admin/audits/{id}/upload` with `publish: true` and `notifyUser: true`.
7. On 400 with `missingKeys` or `invalid`, fix the payload and retry.

## Error responses

| Code | Body | Action |
| --- | --- | --- |
| 401 | `{ "error": "Unauthorized: …" }` | Check `ADMIN_UPLOAD_TOKEN`. |
| 400 | `{ "error": "Schema validation failed.", "invalid": { … } }` | Fix the listed fields. |
| 400 | `{ "error": "Missing N required check key(s) …", "missingKeys": [...] }` | Add those keys to `checks[]`. |
| 404 | `{ "error": "Audit not found" }` | Skip; audit was deleted. |
| 503 | `{ "error": "Server misconfigured: ADMIN_UPLOAD_TOKEN is not set." }` | Set the env var on Vercel. |

## Don'ts

- Do not invent keys. If a key is not in the checklist for the audit mode, it will be flagged as `unknownKeys`.
- Do not paste pure markdown into the upload form expecting it to populate cards. The cards come from `checks[]` only.
- Do not set `publish: true` without filling `score`, `summary`, and `reportMarkdown` — the customer will see a half-empty page.
- Do not lower priority below the checklist default just because the page passes; if the check is `pass`, set `status: "pass"` and keep the default priority.
