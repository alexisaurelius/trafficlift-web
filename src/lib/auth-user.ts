import { auth, currentUser } from "@clerk/nextjs/server";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function requireUserRecord() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const existingByClerkId = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { subscription: true },
  });
  if (existingByClerkId) {
    if (existingByClerkId.subscription) {
      return existingByClerkId;
    }

    await prisma.subscription.create({
      data: {
        userId: existingByClerkId.id,
        plan: PlanType.NONE,
        status: SubscriptionStatus.INACTIVE,
      },
    });

    return prisma.user.findUniqueOrThrow({
      where: { id: existingByClerkId.id },
      include: { subscription: true },
    });
  }

  const clerkUser = await currentUser();
  if (!clerkUser?.primaryEmailAddress?.emailAddress) {
    throw new Error("Missing user email");
  }

  const email = clerkUser.primaryEmailAddress.emailAddress;
  const firstName = clerkUser.firstName ?? undefined;
  const lastName = clerkUser.lastName ?? undefined;

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    include: { subscription: true },
  });
  if (existingByEmail) {
    const needsProfileSync =
      existingByEmail.clerkId !== userId ||
      existingByEmail.email !== email ||
      (existingByEmail.firstName ?? undefined) !== firstName ||
      (existingByEmail.lastName ?? undefined) !== lastName;

    const user = needsProfileSync
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            clerkId: userId,
            email,
            firstName,
            lastName,
          },
          include: { subscription: true },
        })
      : existingByEmail;

    if (!user.subscription) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: PlanType.NONE,
          status: SubscriptionStatus.INACTIVE,
        },
      });
      return prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { subscription: true },
      });
    }

    return user;
  }

  const user = await prisma.user.create({
    data: {
      clerkId: userId,
      email,
      firstName,
      lastName,
      subscription: {
        create: {
          plan: PlanType.NONE,
          status: SubscriptionStatus.INACTIVE,
        },
      },
    },
    include: { subscription: true },
  });

  return user;
}
