import { CreditEventType, PlanType, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { addCredits, allocateCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { getMonthlyAllowance } from "@/lib/plans";
import { getStripeClient } from "@/lib/stripe";

function planFromStripePrice(priceId?: string | null): PlanType {
  if (priceId && priceId === process.env.STRIPE_PRICE_STANDARD_MONTHLY) return PlanType.STANDARD;
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return PlanType.PRO;
  if (priceId && priceId === process.env.STRIPE_PRICE_ONE_TIME_AUDIT) return PlanType.ONE_TIME;
  return PlanType.NONE;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const plan = (session.metadata?.plan as PlanType | undefined) ?? PlanType.NONE;
  if (!userId || plan === PlanType.NONE) return;

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : null,
      stripeOneTimePaymentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      monthlyCreditAllowance: plan === PlanType.ONE_TIME ? 0 : getMonthlyAllowance(plan),
      availableCredits: plan === PlanType.ONE_TIME ? 0 : getMonthlyAllowance(plan),
    },
    update: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : null,
      stripeOneTimePaymentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      monthlyCreditAllowance: plan === PlanType.ONE_TIME ? 0 : getMonthlyAllowance(plan),
    },
  });

  if (plan === PlanType.ONE_TIME) {
    await addCredits(
      userId,
      1,
      CreditEventType.ONE_TIME_PURCHASE,
      "One-time audit purchase",
      session.id,
    );
  } else {
    await allocateCredits(
      userId,
      getMonthlyAllowance(plan),
      CreditEventType.MONTHLY_ALLOCATION,
      "Initial subscription credit allocation",
      session.id,
    );
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as unknown as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } };
    lines: { data: Array<{ pricing?: { price_details?: { price?: string } } }> };
  };

  const subscriptionId =
    typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : typeof invoiceAny.parent?.subscription_details?.subscription === "string"
        ? invoiceAny.parent.subscription_details.subscription
        : null;
  if (!subscriptionId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!sub) return;

  const linePriceId = invoiceAny.lines.data[0]?.pricing?.price_details?.price ?? null;
  const plan = planFromStripePrice(linePriceId);
  if (plan === PlanType.NONE || plan === PlanType.ONE_TIME) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : undefined,
      currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
      monthlyCreditAllowance: getMonthlyAllowance(plan),
    },
  });

  await allocateCredits(
    sub.userId,
    getMonthlyAllowance(plan),
    CreditEventType.MONTHLY_ALLOCATION,
    "Monthly subscription renewal credits",
    invoice.id,
  );
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
    }

    const stripe = getStripeClient();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const body = await req.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: false },
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failure";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
