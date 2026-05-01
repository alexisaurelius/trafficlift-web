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
    key: "duplicate-metadata",
    title: "Duplicate Title and Description",
    priority: "medium",
    description: "Duplicate metadata patterns across a lightweight sitemap crawl sample.",
  },
  {
    key: "keyword-density",
    title: "Target Keyword Usage in Body",
    priority: "high",
    description: "Frequency and natural placement of target and semantic keyword phrases in main content.",
  },
  {
    key: "above-the-fold-relevance",
    title: "Above-the-Fold Keyword Relevance",
    priority: "high",
    description: "Whether the hero and first screen clearly reflect the target topic and search intent.",
  },
  {
    key: "content-depth",
    title: "Content Length and Depth",
    priority: "high",
    description: "Word count, topical coverage, and comparability to competing pages for the query.",
  },
  {
    key: "open-graph",
    title: "Open Graph Tags",
    priority: "medium",
    description: "og:title, og:description, og:image, and related social preview tags.",
  },
  {
    key: "anchor-text-quality",
    title: "Anchor Text and Link Semantics",
    priority: "medium",
    description: "Descriptive anchors, empty or icon-only links, and internal link text quality.",
  },
  {
    key: "semantic-landmarks",
    title: "Semantic HTML and Landmarks",
    priority: "low",
    description: "header, main, nav, footer, and landmark structure for a11y and page outline clarity.",
  },
  {
    key: "favicon",
    title: "Favicon and App Icons",
    priority: "low",
    description: "Favicon, touch icons, and small-brand assets referenced from the head.",
  },
  {
    key: "blog-cannibalization",
    title: "Topical Focus vs. Supporting Content",
    priority: "low",
    description: "Whether blog or off-topic blocks dilute the main page’s topical focus for the target query.",
  },
  {
    key: "faq-section",
    title: "FAQ Block and Long-Tail Capture",
    priority: "medium",
    description: "Presence and quality of on-page FAQ content; optional FAQPage schema support.",
  },
  {
    key: "performance-hints",
    title: "Page Weight and Performance Signals",
    priority: "medium",
    description: "Image count, LCP-relevant assets, and high-level CWV/performance risk signals (no lab score required).",
  },
  {
    key: "trust-signals",
    title: "E-E-A-T and Trust Signals",
    priority: "medium",
    description: "Verifiable claims, social proof, credentials, and authority-oriented content.",
  },
  {
    key: "url-structure",
    title: "URL Structure and Cleanliness",
    priority: "low",
    description: "Path clarity, query strings, hashes, and tracking parameters on the audited URL.",
  },
];
