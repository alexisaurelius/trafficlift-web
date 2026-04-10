import { PlanType } from "@prisma/client";

export type PlanConfig = {
  plan: PlanType;
  label: string;
  monthlyCredits: number;
  priceCents: number;
  recurring: boolean;
  description: string;
};

export const PLAN_CONFIGS: Record<PlanType, PlanConfig> = {
  NONE: {
    plan: "NONE",
    label: "No Plan",
    monthlyCredits: 0,
    priceCents: 0,
    recurring: false,
    description: "No active plan.",
  },
  ONE_TIME: {
    plan: "ONE_TIME",
    label: "One-time Audit",
    monthlyCredits: 1,
    priceCents: 899,
    recurring: false,
    description: "Single audit credit for one off SEO checks.",
  },
  STANDARD: {
    plan: "STANDARD",
    label: "Standard",
    monthlyCredits: 10,
    priceCents: 2400,
    recurring: true,
    description: "10 audit credits per month.",
  },
  PRO: {
    plan: "PRO",
    label: "Pro",
    monthlyCredits: 30,
    priceCents: 4900,
    recurring: true,
    description: "30 audit credits per month.",
  },
};

export function getMonthlyAllowance(plan: PlanType): number {
  return PLAN_CONFIGS[plan].monthlyCredits;
}
