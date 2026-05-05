import { NextResponse } from "next/server";
import { ADMIN_AUDIT_SECTION_EXAMPLE, AUDIT_SECTIONS } from "@/lib/audit-text-sections";

export async function GET() {
  return NextResponse.json({
    version: "2.0.0",
    description:
      "Upload schema for completed manual audits. Each audit is delivered as three markdown text blocks — On-Page SEO, Technical & Performance, and Authority. Each block is a list of `**Item: <Title>**` entries followed by `Current state:`, `Analysis:`, and `Status:` lines.",
    sections: AUDIT_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      field: section.id === "on-page" ? "onPageContent" : section.id === "tech-perf" ? "techPerfContent" : "authorityContent",
    })),
    statusLabels: ["Good", "Needs Improvement", "Critical"],
    fields: {
      score: "integer 0-100, optional, drives the headline donut score",
      summary: "short plain-text summary shown above the audit panel",
      onPageContent: "markdown for the On-Page SEO section (max 50000 chars)",
      techPerfContent: "markdown for the Technical & Performance section (max 50000 chars)",
      authorityContent: "markdown for the Authority section (max 50000 chars)",
      publish: "boolean. true => set status COMPLETED and (optionally) email customer",
      notifyUser: "boolean. when publish=true, controls customer notification email",
      status: "optional override of audit status when publish is false (QUEUED|RUNNING|COMPLETED|FAILED)",
    },
    endpoints: {
      list: "GET /api/admin/audits?status=QUEUED&q=<email|url|id>",
      get: "GET /api/admin/audits/{id}",
      uploadHeadless:
        "POST /api/admin/audits/{id}/upload  Authorization: Bearer ADMIN_UPLOAD_TOKEN  body: { score?, summary?, onPageContent?, techPerfContent?, authorityContent?, publish?, notifyUser? }",
      patchSession: "PATCH /api/admin/audits/{id}  (Clerk admin session)",
      spec: "GET /api/admin/audits/spec",
    },
    examples: ADMIN_AUDIT_SECTION_EXAMPLE,
  });
}
