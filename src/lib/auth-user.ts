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

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      email,
      firstName,
      lastName,
    },
    create: {
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
