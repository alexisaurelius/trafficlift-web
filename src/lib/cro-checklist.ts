import type { ChecklistTemplate } from "@/lib/seo-checklist";

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
