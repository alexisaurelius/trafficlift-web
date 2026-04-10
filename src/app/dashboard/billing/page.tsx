import { requireUserRecord } from "@/lib/auth-user";
import { BillingActions } from "@/components/billing-actions";

const plans = [
  {
    id: "ONE_TIME" as const,
    name: "One-time Audit",
    price: "$8.99",
    subtitle: "Single report",
    credits: "1 credit",
  },
  {
    id: "STANDARD" as const,
    name: "Standard",
    price: "$24/mo",
    subtitle: "Monthly plan",
    credits: "10 credits monthly",
  },
  {
    id: "PRO" as const,
    name: "Pro",
    price: "$49/mo",
    subtitle: "Monthly plan",
    credits: "30 credits monthly",
  },
];

export default async function BillingPage() {
  const user = await requireUserRecord();
  const devBillingBypass = process.env.NODE_ENV !== "production" && process.env.DEV_BILLING_BYPASS !== "false";

  return (
    <section className="space-y-7">
      <header>
        <p className="inline-flex rounded-full bg-[var(--surface-container-low)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/65">
          Subscription Center
        </p>
        <h1 className="mt-3 font-manrope text-3xl font-extrabold tracking-tight text-[var(--primary)]">Billing & Credits</h1>
        <p className="mt-2 text-sm text-[var(--on-surface)]/70">
          Current plan: {devBillingBypass ? "DEV MODE" : (user.subscription?.plan ?? "NONE")} · Available credits:{" "}
          {devBillingBypass ? "Unlimited (Dev)" : (user.subscription?.availableCredits ?? 0)}
        </p>
      </header>

      <div className="grid gap-3.5 md:grid-cols-2">
        <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-4 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Current Plan</p>
          <h2 className="mt-2 font-manrope text-2xl font-extrabold">
            {devBillingBypass ? "DEV MODE" : (user.subscription?.plan ?? "NONE")}
          </h2>
        </article>
        <article className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-4 shadow-[0_12px_40px_rgba(0,22,57,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Available Credits</p>
          <h2 className="mt-2 font-manrope text-2xl font-extrabold">
            {devBillingBypass ? "Unlimited (Dev)" : (user.subscription?.availableCredits ?? 0)}
          </h2>
        </article>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-2xl border border-[color:color-mix(in_oklab,var(--primary)_9%,white)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_12px_40px_rgba(0,22,57,0.06)]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              {plan.subtitle}
            </p>
            <h2 className="mt-2 font-manrope text-2xl font-extrabold">{plan.name}</h2>
            <p className="mt-2 text-3xl font-black text-[var(--primary)]">{plan.price}</p>
            <p className="mt-1 text-sm text-[var(--on-surface)]/70">{plan.credits}</p>
            <BillingActions plan={plan.id} />
          </article>
        ))}
      </div>
    </section>
  );
}
