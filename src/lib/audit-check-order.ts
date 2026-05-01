import type { AuditCheck } from "@prisma/client";
import type { ChecklistTemplate } from "@/lib/seo-checklist";

/** Template order first, then any extra rows (e.g. manual checks with keys not in the static checklist). */
export function orderChecksForDisplay(checks: AuditCheck[], template: ChecklistTemplate[]): AuditCheck[] {
  const byKey = new Map(checks.map((c) => [c.key, c]));
  const ordered: AuditCheck[] = [];
  const used = new Set<string>();
  for (const t of template) {
    const c = byKey.get(t.key);
    if (c) {
      ordered.push(c);
      used.add(c.key);
    }
  }
  for (const c of checks) {
    if (!used.has(c.key)) {
      ordered.push(c);
      used.add(c.key);
    }
  }
  return ordered;
}
