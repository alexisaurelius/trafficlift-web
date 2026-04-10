import { auth, currentUser } from "@clerk/nextjs/server";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function requireUserRecord() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const clerkUser = await currentUser();
  if (!clerkUser?.primaryEmailAddress?.emailAddress) {
    throw new Error("Missing user email");
  }

  const email = clerkUser.primaryEmailAddress.emailAddress;
  const firstName = clerkUser.firstName ?? undefined;
  const lastName = clerkUser.lastName ?? undefined;

  const existingByClerkId = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { subscription: true },
  });
  if (existingByClerkId) {
    return prisma.user.update({
      where: { id: existingByClerkId.id },
      data: {
        email,
        firstName,
        lastName,
      },
      include: { subscription: true },
    });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    include: { subscription: true },
  });
  if (existingByEmail) {
    const user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkId: userId,
        email,
        firstName,
        lastName,
      },
      include: { subscription: true },
    });

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
