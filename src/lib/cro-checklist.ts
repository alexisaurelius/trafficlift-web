import type { ChecklistTemplate } from "@/lib/seo-checklist";

export const CRO_AUDIT_CHECKLIST: ChecklistTemplate[] = [
  {
    key: "hero-clarity",
    title: "Hero and Above-the-Fold Clarity",
    priority: "critical",
    description: "Visible headline, clear value proposition, and primary CTA above the fold.",
  },
  {
    key: "hero-dual-cta",
    title: "Hero CTA Strategy Coverage",
    priority: "high",
    description: "Checks for complementary primary and secondary CTAs in the hero.",
  },
  {
    key: "cta-microcopy-reassurance",
    title: "CTA Microcopy Reassurance",
    priority: "high",
    description: "Checks for no-risk reassurance text near hero CTA (trial, no card, cancel anytime).",
  },
  {
    key: "quantified-outcomes",
    title: "Quantified Outcomes Evidence",
    priority: "high",
    description: "Checks for concrete performance metrics (percentages, multipliers, timelines).",
  },
  {
    key: "cta-audit",
    title: "Call To Action Quality",
    priority: "critical",
    description: "CTA visibility, strength, consistency, and placement along user flow.",
  },
  {
    key: "pricing-comparison-clarity",
    title: "Pricing Comparison Clarity",
    priority: "high",
    description: "Checks whether multi-tier pricing is easy to compare (table/matrix style signals).",
  },
  {
    key: "language-consistency",
    title: "Language Consistency",
    priority: "critical",
    description: "Detects mixed-language content that can break trust and comprehension.",
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
    description: "Visible support and contact paths (help center, chat, contact).",
  },
  {
    key: "faq-depth",
    title: "FAQ Depth and Coverage",
    priority: "high",
    description: "Checks FAQ volume for core purchase objections (billing, cancellation, fit, safety).",
  },
  {
    key: "analytics-tracking",
    title: "Analytics and Tracking Foundation",
    priority: "high",
    description: "Core analytics, tag manager, and conversion event instrumentation.",
  },
  {
    key: "footer-cta-clarity",
    title: "Footer CTA Clarity",
    priority: "medium",
    description: "Checks for contextual microcopy and low-friction framing in footer CTAs.",
  },
];
