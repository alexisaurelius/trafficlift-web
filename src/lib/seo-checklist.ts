export type CheckPriority = "critical" | "high" | "medium" | "low";

export type ChecklistTemplate = {
  key: string;
  title: string;
  priority: CheckPriority;
  description: string;
};

export const AUDIT_CHECKLIST: ChecklistTemplate[] = [
  {
    key: "title-tag",
    title: "Title Tag",
    priority: "high",
    description: "Length and exact inclusion of all user-entered keyword phrases.",
  },
  {
    key: "meta-description",
    title: "Meta Description",
    priority: "high",
    description: "SERP-safe length and compelling value proposition.",
  },
  {
    key: "h1-count",
    title: "H1 and Primary Heading",
    priority: "high",
    description: "Exactly one H1 containing every user-entered keyword phrase (exact match).",
  },
  {
    key: "h2-keyword",
    title: "H2 Keyword Alignment",
    priority: "high",
    description: "At least one H2 contains every user-entered keyword phrase (exact match).",
  },
  {
    key: "heading-hierarchy",
    title: "Heading Hierarchy",
    priority: "medium",
    description: "Semantic H2/H3 ordering and section relevance.",
  },
  {
    key: "structured-data",
    title: "Structured Data Validity",
    priority: "high",
    description: "JSON-LD syntax quality and rich results eligibility.",
  },
  {
    key: "schema-coverage",
    title: "Schema Coverage by Type",
    priority: "high",
    description: "Organization and WebSite JSON-LD coverage.",
  },
  {
    key: "canonical",
    title: "Canonical URL",
    priority: "critical",
    description: "Canonical consistency and self-reference checks.",
  },
  {
    key: "canonical-consistency",
    title: "Canonical Consistency",
    priority: "high",
    description: "Canonical alignment with live URL, host, and preferred path.",
  },
  {
    key: "indexability-controls",
    title: "Indexability Controls",
    priority: "critical",
    description: "noindex/nofollow directives in meta robots and x-robots-tag headers.",
  },
  {
    key: "http-status-chain",
    title: "HTTP Status and Redirect Chain",
    priority: "high",
    description: "Final status, redirect hop count, and temporary redirect usage.",
  },
  {
    key: "hreflang",
    title: "Hreflang and International Signals",
    priority: "medium",
    description: "x-default and locale mapping consistency.",
  },
  {
    key: "sitemap",
    title: "Sitemap Coverage",
    priority: "high",
    description: "Homepage and indexable URLs in sitemap.xml.",
  },
  {
    key: "robots",
    title: "Robots Rules",
    priority: "low",
    description: "Crawl directives; sitemap in robots.txt is optional if sitemaps are submitted elsewhere.",
  },
  {
    key: "robots-ai-policy",
    title: "AI Crawler Policy",
    priority: "low",
    description: "Informational: which AI-related bot names appear in robots.txt (not a pass/fail).",
  },
  {
    key: "social-tags",
    title: "Open Graph and X Cards",
    priority: "low",
    description: "Preview metadata quality for social distribution.",
  },
  {
    key: "twitter-card-coverage",
    title: "Twitter Card Coverage",
    priority: "low",
    description: "Presence of twitter:card/title/description/image tags.",
  },
  {
    key: "alt-text",
    title: "Image Alt Text Coverage",
    priority: "medium",
    description: "Meaningful alt text and image loading hints.",
  },
  {
    key: "image-performance",
    title: "Image Loading and Preload Strategy",
    priority: "medium",
    description: "Lazy loading for below-fold assets and preload hints for LCP images.",
  },
  {
    key: "internal-linking",
    title: "Internal Linking Strength",
    priority: "medium",
    description: "Navigation flow and contextual anchor links.",
  },
  {
    key: "internal-links-health",
    title: "Internal Links Health",
    priority: "high",
    description: "Broken internal links and excessive redirect chains on linked pages.",
  },
  {
    key: "pagespeed",
    title: "Page Speed and Core Web Vitals",
    priority: "high",
    description: "LCP, CLS, INP/FID when PageSpeed API is configured.",
  },
  {
    key: "render-blocking-resources",
    title: "Render-Blocking Resources",
    priority: "high",
    description: "Blocking CSS/JS patterns that delay first render and interactivity.",
  },
  {
    key: "asset-caching-compression",
    title: "Asset Caching and Compression",
    priority: "medium",
    description: "Cache-control and compression coverage for core JS/CSS assets.",
  },
  {
    key: "third-party-script-weight",
    title: "Third-Party Script Weight",
    priority: "medium",
    description: "External script count and domain footprint affecting load performance.",
  },
  {
    key: "duplicate-metadata",
    title: "Duplicate Title and Description",
    priority: "medium",
    description: "Duplicate metadata patterns across a lightweight sitemap crawl sample.",
  },
  {
    key: "safe-browsing",
    title: "Google Safe Browsing Risk",
    priority: "high",
    description: "Malware and phishing risk flags when the Safe Browsing API is configured.",
  },
];
