import type { ChecklistTemplate } from "@/lib/seo-checklist";

export const CRO_AUDIT_CHECKLIST: ChecklistTemplate[] = [
  {
    key: "entry-experience",
    title: "First Impression and Entry Experience",
    priority: "critical",
    description: "Popup timing, overlay friction, and immediate clarity in first seconds.",
  },
  {
    key: "hero-clarity",
    title: "Hero and Above-the-Fold Clarity",
    priority: "critical",
    description: "Visible headline, clear value proposition, and primary CTA above the fold.",
  },
  {
    key: "value-proposition",
    title: "Value Proposition and Messaging",
    priority: "high",
    description: "Benefit-led copy, USP clarity, and objection handling in messaging.",
  },
  {
    key: "cta-audit",
    title: "Call To Action Quality",
    priority: "critical",
    description: "CTA visibility, strength, consistency, and placement along user flow.",
  },
  {
    key: "pricing-transparency",
    title: "Pricing Transparency",
    priority: "critical",
    description: "Price visibility, click distance to pricing, and anchor framing.",
  },
  {
    key: "social-proof",
    title: "Social Proof and Trust Signals",
    priority: "critical",
    description: "Testimonials, ratings, guarantees, trust badges, and credibility cues.",
  },
  {
    key: "nav-architecture",
    title: "Navigation and Information Architecture",
    priority: "high",
    description: "Conversion path clarity and friction from navigation structure.",
  },
  {
    key: "scroll-experience",
    title: "Page Structure and Scroll Experience",
    priority: "medium",
    description: "Readability, scan flow, and forced-scroll interactions.",
  },
  {
    key: "funnel-friction",
    title: "Funnel Friction Points",
    priority: "critical",
    description: "Checkout path obstacles, form friction, and conversion blockers.",
  },
  {
    key: "offer-communication",
    title: "Product and Offer Communication",
    priority: "high",
    description: "Feature context, objection handling, and scannable decision support.",
  },
  {
    key: "technical-health",
    title: "Technical and Metadata Health",
    priority: "high",
    description: "Meta setup, social tags, schema presence, and client-side stability.",
  },
  {
    key: "mobile-experience",
    title: "Mobile Conversion Experience",
    priority: "critical",
    description: "Tap usability, readability, and mobile friction risks.",
  },
  {
    key: "support-objections",
    title: "Support and Objection Handling",
    priority: "medium",
    description: "Visible support channels and answers to buyer objections.",
  },
  {
    key: "urgency-incentives",
    title: "Urgency and Incentive Triggers",
    priority: "medium",
    description: "Scarcity, urgency, free shipping, and risk-reversal cues.",
  },
  {
    key: "analytics-tracking",
    title: "Analytics and Tracking Foundation",
    priority: "high",
    description: "Core analytics, tag manager, and conversion event instrumentation.",
  },
];
