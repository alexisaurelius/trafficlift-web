import { CreditEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function isDevBillingBypassEnabled() {
  return process.env.DEV_BILLING_BYPASS === "true";
}

export async function canConsumeCredit(userId: string) {
  if (isDevBillingBypassEnabled()) {
    return true;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription) return false;
  return subscription.availableCredits > 0;
}

export async function consumeCredit(userId: string, reason: string, referenceId: string) {
  if (isDevBillingBypassEnabled()) {
    return Number.POSITIVE_INFINITY;
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || subscription.availableCredits <= 0) {
      throw new Error("No remaining audit credits");
    }

    const nextBalance = subscription.availableCredits - 1;
    await tx.subscription.update({
      where: { userId },
      data: { availableCredits: nextBalance },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        eventType: CreditEventType.AUDIT_CONSUMED,
        delta: -1,
        balance: nextBalance,
        reason,
        referenceId,
      },
    });

    return nextBalance;
  });
}

export async function allocateCredits(
  userId: string,
  count: number,
  eventType: CreditEventType,
  reason: string,
  referenceId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const nextBalance = count;
    await tx.subscription.update({
      where: { userId },
      data: {
        availableCredits: nextBalance,
        monthlyCreditAllowance: count,
      },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        eventType,
        delta: count,
        balance: nextBalance,
        reason,
        referenceId,
      },
    });
  });
}

export async function addCredits(
  userId: string,
  count: number,
  eventType: CreditEventType,
  reason: string,
  referenceId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const nextBalance = subscription.availableCredits + count;
    await tx.subscription.update({
      where: { userId },
      data: {
        availableCredits: nextBalance,
      },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        eventType,
        delta: count,
        balance: nextBalance,
        reason,
        referenceId,
      },
    });
  });
}
