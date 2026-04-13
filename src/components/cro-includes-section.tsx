"use client";

import { useState } from "react";
import { BadgePercent, ChartNoAxesColumn, FileSearch, MousePointerClick, ShoppingCart, Users } from "lucide-react";

type IncludeItem = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const INCLUDE_ITEMS: IncludeItem[] = [
  {
    id: "funnel-mapping",
    title: "Funnel Mapping",
    description: "Track drop-off points from first visit to checkout completion.",
    icon: ChartNoAxesColumn,
  },
  {
    id: "ux-friction",
    title: "UX Friction",
    description: "Identify unclear UI patterns and hesitation points around your key actions.",
    icon: MousePointerClick,
  },
  {
    id: "offer-clarity",
    title: "Offer Clarity",
    description: "Evaluate value proposition visibility and message-to-intent alignment.",
    icon: FileSearch,
  },
  {
    id: "checkout-flow",
    title: "Checkout Flow",
    description: "Audit pricing selection, payment confidence, and abandonment triggers.",
    icon: ShoppingCart,
  },
  {
    id: "trust-signals",
    title: "Trust Signals",
    description: "Review testimonials, guarantees, and authority cues near conversion points.",
    icon: Users,
  },
  {
    id: "ab-testing",
    title: "A/B Testing Plan",
    description: "Get prioritized test ideas ranked by expected conversion impact.",
    icon: BadgePercent,
  },
];

export function CroIncludesSection() {
  const [active, setActive] = useState<string>("ux-friction");

  return (
    <section className="mt-14 relative">
      <div className="absolute right-0 top-11 hidden h-1 w-20 rounded-full bg-[#22c55e] md:block" />

      <h2 className="font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
        What Your AI CRO Audit Includes
      </h2>
      <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-[var(--on-surface)]/72">
        A complete conversion-focused review of each element influencing action and revenue.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {INCLUDE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`flex items-start gap-4 rounded-2xl p-4 text-left transition ${
                isActive
                  ? "bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(0,22,57,0.2)]"
                  : "bg-[var(--surface-container-low)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]"
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isActive ? "bg-white/15" : "bg-[var(--surface-container-lowest)]"
                }`}
              >
                <Icon size={18} className={isActive ? "text-white" : "text-[var(--primary)]"} />
              </span>
              <span>
                <span className="block font-manrope text-[19px] font-extrabold leading-tight">{item.title}</span>
                <span className={`mt-2 block text-[14px] leading-relaxed ${isActive ? "text-white/85" : "text-[var(--on-surface)]/72"}`}>
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
