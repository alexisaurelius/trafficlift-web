"use client";

import { useState } from "react";
import { Cog, FileText, Gauge, KeyRound, Link2, SearchCheck } from "lucide-react";

type IncludeItem = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const INCLUDE_ITEMS: IncludeItem[] = [
  {
    id: "technical",
    title: "Technical SEO",
    description: "Crawlability, XML sitemaps, robots.txt, and site architecture analysis.",
    icon: Cog,
  },
  {
    id: "on-page",
    title: "On-page",
    description: "Meta tags, headers, image alt text, and keyword density mapping.",
    icon: FileText,
  },
  {
    id: "content",
    title: "Content Quality",
    description: "E-E-A-T evaluation, thin content detection, and readability score.",
    icon: SearchCheck,
  },
  {
    id: "keywords",
    title: "Keywords",
    description: "Gap analysis and identification of low-hanging fruit ranking opportunities.",
    icon: KeyRound,
  },
  {
    id: "internal-linking",
    title: "Internal Linking",
    description: "Anchor text distribution and link equity flow optimization.",
    icon: Link2,
  },
  {
    id: "speed",
    title: "Page Speed",
    description: "Core Web Vitals performance and server response time metrics.",
    icon: Gauge,
  },
];

export function AuditIncludesSection() {
  const [active, setActive] = useState<string>("on-page");

  return (
    <section className="mt-14 relative">
      <div className="absolute right-0 top-11 hidden h-1 w-20 rounded-full bg-[#22c55e] md:block" />

      <h2 className="font-manrope text-4xl font-extrabold tracking-tight text-[var(--primary)]">
        What Your SEO Audit Includes
      </h2>
      <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-[var(--on-surface)]/72">
        A comprehensive deep-dive into every factor that influences your organic search performance.
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
                <span className="block font-manrope text-[19px] font-extrabold leading-tight">
                  {item.title}
                </span>
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
