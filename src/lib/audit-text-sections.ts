// Shared types and helpers for the text-section based audit upload flow.
// The admin uploads three markdown blocks (one per category). Each block is
// a list of `**Item: <Title>**` entries with `Current state:`, `Analysis:`,
// and `Status:` lines. We parse those blocks into structured items so the
// user dashboard can filter and render them consistently.

export const AUDIT_SECTION_IDS = ["on-page", "tech-perf", "authority"] as const;
export type AuditSectionId = (typeof AUDIT_SECTION_IDS)[number];

export type AuditItemStatus = "good" | "needs-improvement" | "critical";

export type ParsedAuditItem = {
  section: AuditSectionId;
  title: string;
  currentState: string;
  analysis: string;
  statusRaw: string;
  status: AuditItemStatus;
};

export type AuditSectionMeta = {
  id: AuditSectionId;
  label: string;
  filterLabel: string;
  shortLabel: string;
};

export const AUDIT_SECTIONS: AuditSectionMeta[] = [
  { id: "on-page", label: "On-Page SEO", filterLabel: "On-Page", shortLabel: "On-Page" },
  {
    id: "tech-perf",
    label: "Technical & Performance",
    filterLabel: "Technical & Performance",
    shortLabel: "Technical & Performance",
  },
  { id: "authority", label: "Authority", filterLabel: "Authority", shortLabel: "Authority" },
];

export function classifyStatus(raw: string): AuditItemStatus {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return "needs-improvement";
  if (/(^|[^a-z])(good|pass(ed)?|ok|excellent)([^a-z]|$)/.test(normalized)) {
    return "good";
  }
  if (
    /(^|[^a-z])(critical|fail(ed)?|bad|broken|error|missing|severe)([^a-z]|$)/.test(normalized)
  ) {
    return "critical";
  }
  return "needs-improvement";
}

// Strip a single set of leading bullet markers like "-", "*", or "•".
function stripBullet(line: string): string {
  return line.replace(/^\s*[-*•]\s+/, "");
}

// Extract a label/value pair when the line starts with one of the recognized
// section field labels. Returns null when the line is not a recognized label.
function matchFieldLabel(line: string):
  | { field: "currentState" | "analysis" | "status"; value: string }
  | null {
  const candidate = stripBullet(line).trim();
  const match = candidate.match(/^(Current state|Analysis|Status)\s*:\s*(.*)$/i);
  if (!match) return null;
  const labelKey = match[1].toLowerCase();
  const value = match[2].trim();
  if (labelKey === "current state") return { field: "currentState", value };
  if (labelKey === "analysis") return { field: "analysis", value };
  return { field: "status", value };
}

function startsNewItem(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Bold form: **Item: Title**
  let match = trimmed.match(/^\*\*\s*Item\s*:\s*(.+?)\s*\*\*\s*$/i);
  if (match) return match[1].trim();
  // Plain form: Item: Title
  match = trimmed.match(/^Item\s*:\s*(.+)$/i);
  if (match) return match[1].replace(/\*+$/, "").trim();
  return null;
}

function appendValue(prev: string, addition: string): string {
  const next = addition.trim();
  if (!next) return prev;
  if (!prev) return next;
  return `${prev} ${next}`;
}

export function parseAuditSection(text: string | null | undefined, section: AuditSectionId): ParsedAuditItem[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const items: ParsedAuditItem[] = [];
  let current: ParsedAuditItem | null = null;
  let currentField: "currentState" | "analysis" | "status" | null = null;

  const finalize = () => {
    if (!current) return;
    current.status = classifyStatus(current.statusRaw);
    items.push(current);
    current = null;
    currentField = null;
  };

  for (const rawLine of lines) {
    const newTitle = startsNewItem(rawLine);
    if (newTitle !== null) {
      finalize();
      current = {
        section,
        title: newTitle,
        currentState: "",
        analysis: "",
        statusRaw: "",
        status: "needs-improvement",
      };
      currentField = null;
      continue;
    }

    if (!current) continue;

    const fieldMatch = matchFieldLabel(rawLine);
    if (fieldMatch) {
      currentField = fieldMatch.field;
      if (currentField === "currentState") {
        current.currentState = fieldMatch.value;
      } else if (currentField === "analysis") {
        current.analysis = fieldMatch.value;
      } else {
        current.statusRaw = fieldMatch.value;
      }
      continue;
    }

    const trimmed = rawLine.trim();
    // Skip section dividers like `---` or empty lines (they just end a field).
    if (!trimmed || /^-{3,}$/.test(trimmed) || /^#{1,6}\s/.test(trimmed)) {
      currentField = null;
      continue;
    }

    if (!currentField) continue;
    const continuation = stripBullet(rawLine).trim();
    if (currentField === "currentState") {
      current.currentState = appendValue(current.currentState, continuation);
    } else if (currentField === "analysis") {
      current.analysis = appendValue(current.analysis, continuation);
    } else {
      current.statusRaw = appendValue(current.statusRaw, continuation);
    }
  }

  finalize();
  return items;
}

export type ParsedAuditSections = {
  onPage: ParsedAuditItem[];
  techPerf: ParsedAuditItem[];
  authority: ParsedAuditItem[];
};

export function parseAuditSections(input: {
  onPageContent?: string | null;
  techPerfContent?: string | null;
  authorityContent?: string | null;
}): ParsedAuditSections {
  return {
    onPage: parseAuditSection(input.onPageContent, "on-page"),
    techPerf: parseAuditSection(input.techPerfContent, "tech-perf"),
    authority: parseAuditSection(input.authorityContent, "authority"),
  };
}

export function hasAnyAuditSectionContent(input: {
  onPageContent?: string | null;
  techPerfContent?: string | null;
  authorityContent?: string | null;
}): boolean {
  return Boolean(
    (input.onPageContent && input.onPageContent.trim().length > 0) ||
      (input.techPerfContent && input.techPerfContent.trim().length > 0) ||
      (input.authorityContent && input.authorityContent.trim().length > 0),
  );
}

// Counts a status across all parsed sections — used for headline pills.
export function countStatuses(parsed: ParsedAuditSections): {
  good: number;
  needsImprovement: number;
  critical: number;
  total: number;
} {
  const all = [...parsed.onPage, ...parsed.techPerf, ...parsed.authority];
  let good = 0;
  let needsImprovement = 0;
  let critical = 0;
  for (const item of all) {
    if (item.status === "good") good += 1;
    else if (item.status === "critical") critical += 1;
    else needsImprovement += 1;
  }
  return { good, needsImprovement, critical, total: all.length };
}

// Sample text used by the admin "Insert example" button to seed the textarea
// with the canonical format the team uploads.
export const ADMIN_AUDIT_SECTION_EXAMPLE: Record<AuditSectionId, string> = {
  "on-page": `**Item: Title Tag**
- Current state: "Best Real Estate CRM & Marketing Automation | IXACT Contact" (59 characters)
- Analysis: Length is within the optimal 50–60 character range. The primary target keyword is present and positioned near the front, and the brand is included at the end.
- Status: Good

**Item: Meta Description**
- Current state: "All-in-One Real Estate CRM and Marketing Automation System." (125 characters)
- Analysis: Contains the primary keyword but is on the shorter side. ~30–35 characters of additional space could be used for value props.
- Status: Needs Improvement
`,
  "tech-perf": `**Item: Canonical Tag**
- Current state: https://www.example.com/
- Analysis: Self-referencing canonical pointing to the same URL — correctly configured.
- Status: Good

**Item: Robots Meta Tag**
- Current state: "index, follow, max-image-preview:large"
- Analysis: Page is indexable and followable with permissive snippet directives.
- Status: Good
`,
  authority: `**Item: Brand/Organization Schema**
- Current state: Organization schema present in JSON-LD
- Analysis: Helps establish entity identity for Google's Knowledge Graph.
- Status: Good

**Item: External Outbound Authority Links**
- Current state: 4 external links
- Analysis: Limited outbound references. Linking to authoritative industry sources could reinforce topical authority.
- Status: Needs Improvement
`,
};
