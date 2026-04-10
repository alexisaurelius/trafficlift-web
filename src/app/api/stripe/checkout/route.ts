import { NextResponse } from "next/server";
import { PlanType } from "@prisma/client";
import { z } from "zod";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

const checkoutSchema = z.object({
  plan: z.enum([PlanType.ONE_TIME, PlanType.STANDARD, PlanType.PRO]),
});

const stripePrices: Record<PlanType, string | undefined> = {
  NONE: undefined,
  ONE_TIME: process.env.STRIPE_PRICE_ONE_TIME_AUDIT,
  STANDARD: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
  PRO: process.env.STRIPE_PRICE_PRO_MONTHLY,
};

export async function POST(req: Request) {
  try {
    const user = await requireUserRecord();
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
    }

    const priceId = stripePrices[parsed.data.plan];
    if (!priceId) {
      return NextResponse.json({ error: "Missing Stripe price ID configuration" }, { status: 500 });
    }

    const stripe = getStripeClient();
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    const mode = parsed.data.plan === PlanType.ONE_TIME ? "payment" : "subscription";
    const checkout = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/billing?status=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/billing?status=cancelled`,
      customer: subscription?.stripeCustomerId ?? undefined,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        plan: parsed.data.plan,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
