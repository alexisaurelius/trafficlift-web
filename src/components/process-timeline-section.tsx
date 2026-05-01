"use client";

import { useState } from "react";

const STEPS = [
  {
    title: "Website Analysis",
    body: "Our crawler scans your page for 50+ ranking factors.",
  },
  {
    title: "AI Evaluation",
    body: "Our custom LLMs identify optimization opportunities.",
  },
  {
    title: "Final Review",
    body: "Audits are reviewed by SEO specialists who validate findings and confirm your action plan.",
  },
  {
    title: "Final Delivery",
    body: "Receive your audit in an interactive dashboard with next steps and prioritized actions.",
  },
];

export function ProcessTimelineSection() {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const activeCount = hoveredStep ?? 1;

  return (
    <section
      className="mt-14 rounded-2xl bg-[var(--primary)] px-6 py-10 text-white md:px-8"
      onMouseLeave={() => setHoveredStep(null)}
    >
      <h2 className="text-center font-manrope text-2xl font-extrabold md:text-3xl">
        Clear Process to Boost Your SEO
      </h2>
      <p className="mt-3 text-center text-[16px] text-white/70">
        Four steps to a more visible, higher-ranking website.
      </p>

      <div className="relative mt-8">
        <div className="absolute left-4 right-4 top-6 h-[2px] bg-white/15 md:left-8 md:right-8" />
        <div className="relative grid grid-cols-4 gap-4">
          {["1", "2", "3", "4"].map((step, idx) => {
            const isActive = idx + 1 <= activeCount;
            return (
              <div
                key={step}
                className="flex justify-center"
                onMouseEnter={() => setHoveredStep(idx + 1)}
              >
                <span
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-lg font-extrabold transition-colors ${
                    isActive
                      ? "border-[#22c55e] bg-[#22c55e] text-[var(--primary)]"
                      : "border-[#1f4e8d] bg-[#0b3a75] text-white/85"
                  }`}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 text-center md:grid-cols-4">
        {STEPS.map((item) => (
          <article key={item.title} className="px-2">
            <h3 className="font-manrope text-[22px] font-extrabold">{item.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/75">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
