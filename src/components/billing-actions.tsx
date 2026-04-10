"use client";

import { useState } from "react";

type PlanId = "ONE_TIME" | "STANDARD" | "PRO";

export function BillingActions({ plan }: { plan: PlanId }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url as string;
      } else {
        alert(data.error ?? "Unable to start checkout");
      }
    } catch {
      alert("Checkout failed to start");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={startCheckout}
      disabled={loading}
      className="mt-4 inline-flex w-full items-center justify-center rounded-3xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--primary-container)] disabled:opacity-60"
    >
      {loading ? "Redirecting..." : "Choose Plan"}
    </button>
  );
}
