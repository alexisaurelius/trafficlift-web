import type { ChecklistTemplate } from "@/lib/seo-checklist";

/** Aligns stored DB rows with the current checklist so removed/legacy keys never blank the CRO UI. */
export function mergeCroChecklistWithDb(audit: {
  id: string;
  status: string;
  createdAt: Date;
  checks: Array<{
    id: string;
    auditId: string;
    key: string;
    title: string;
    status: string;
    priority: string;
    details: string | null;
    recommendation: string | null;
    createdAt: Date;
  }>;
}) {
  return CRO_AUDIT_CHECKLIST.map((template) => {
    const row = audit.checks.find((c) => c.key === template.key);
    if (row) {
      return { ...row, title: template.title };
    }
    const isPending = audit.status === "QUEUED" || audit.status === "RUNNING";
    return {
      id: `cro-pending-${template.key}`,
      auditId: audit.id,
      key: template.key,
      title: template.title,
      priority: template.priority,
      status: "warn",
      details: isPending
        ? template.description
        : "No stored result for this check (legacy or incomplete run). Re-run the CRO audit to refresh.",
      recommendation: isPending
        ? "Check results populate when the audit finishes."
        : "Run a new CRO audit to capture the current checklist.",
      createdAt: audit.createdAt,
    };
  });
}

export const CRO_AUDIT_CHECKLIST: ChecklistTemplate[] = [
  {
    key: "hero-dual-cta",
    title: "Hero CTA Strategy Coverage",
    priority: "high",
    description: "Checks for complementary primary and secondary CTAs in the hero.",
  },
  {
    key: "pricing-comparison-clarity",
    title: "Pricing Comparison Clarity",
    priority: "high",
    description: "Checks whether multi-tier pricing is easy to compare (layout plus comparability signals).",
  },
  {
    key: "technical-health",
    title: "Technical and Metadata Health",
    priority: "high",
    description: "Meta setup, social tags, schema presence, and client-side stability.",
  },
  {
    key: "support-objections",
    title: "Support and Contact Paths",
    priority: "medium",
    description: "Support or contact link visible in the header/banner (deterministic).",
  },
  {
    key: "faq-depth",
    title: "FAQ Depth and Coverage",
    priority: "high",
    description: "Detects FAQ sections, visible or schema-backed questions, and accordion-friendly markup.",
  },
  {
    key: "analytics-tracking",
    title: "Analytics and Tracking Foundation",
    priority: "high",
    description: "Core analytics, tag manager, and conversion event instrumentation.",
  },
];
