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
    priceCents: 1499,
    recurring: false,
    description: "Single audit credit for one off SEO checks.",
  },
  STANDARD: {
    plan: "STANDARD",
    label: "Standard",
    monthlyCredits: 10,
    priceCents: 8999,
    recurring: true,
    description: "10 audit credits per month.",
  },
  PRO: {
    plan: "PRO",
    label: "Pro",
    monthlyCredits: 20,
    priceCents: 12999,
    recurring: true,
    description: "20 audit credits per month.",
  },
};

export function getMonthlyAllowance(plan: PlanType): number {
  return PLAN_CONFIGS[plan].monthlyCredits;
}
