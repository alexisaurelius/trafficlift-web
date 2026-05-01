import { auth, currentUser } from "@clerk/nextjs/server";
import { PlanType, Prisma, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
const DEFAULT_ADMIN_EMAILS = ["marcrasin@gmail.com", "worker@trafficlift.ai"];

const userWithSubscription = {
  include: { subscription: true },
} as const;

type UserWithSub = Prisma.UserGetPayload<typeof userWithSubscription>;

function isPrismaUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function loadUser(id: string): Promise<UserWithSub> {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    ...userWithSubscription,
  });
}

async function ensureInactiveSubscription(userId: string) {
  try {
    await prisma.subscription.create({
      data: {
        userId,
        plan: PlanType.NONE,
        status: SubscriptionStatus.INACTIVE,
      },
    });
  } catch (e) {
    if (!isPrismaUniqueViolation(e)) {
      throw e;
    }
  }
}

export function isAdminEmail(email: string) {
  const raw = process.env.ADMIN_EMAIL?.trim();
  const configured = raw && raw.length > 0
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase());
  return configured.includes(email.trim().toLowerCase());
}

export async function requireUserRecord() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let existingByClerkId = await prisma.user.findUnique({
    where: { clerkId: userId },
    ...userWithSubscription,
  });
  if (existingByClerkId) {
    if (!existingByClerkId.subscription) {
      await ensureInactiveSubscription(existingByClerkId.id);
      existingByClerkId = await loadUser(existingByClerkId.id);
    }
    return existingByClerkId;
  }

  const clerkUser = await currentUser();
  if (!clerkUser?.primaryEmailAddress?.emailAddress) {
    redirect("/sign-in?error=missing_user_email");
  }

  const email = clerkUser.primaryEmailAddress.emailAddress;
  const firstName = clerkUser.firstName ?? undefined;
  const lastName = clerkUser.lastName ?? undefined;

  // Race: another request may have created this Clerk user after our first lookup.
  const existingByClerkIdRetry = await prisma.user.findUnique({
    where: { clerkId: userId },
    ...userWithSubscription,
  });
  if (existingByClerkIdRetry) {
    if (!existingByClerkIdRetry.subscription) {
      await ensureInactiveSubscription(existingByClerkIdRetry.id);
    }
    return loadUser(existingByClerkIdRetry.id);
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    ...userWithSubscription,
  });
  if (existingByEmail) {
    const needsProfileSync =
      existingByEmail.clerkId !== userId ||
      (existingByEmail.firstName ?? undefined) !== firstName ||
      (existingByEmail.lastName ?? undefined) !== lastName;

    if (!needsProfileSync) {
      if (!existingByEmail.subscription) {
        await ensureInactiveSubscription(existingByEmail.id);
        return loadUser(existingByEmail.id);
      }
      return existingByEmail;
    }

    let user: UserWithSub;
    try {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          clerkId: userId,
          firstName,
          lastName,
        },
        ...userWithSubscription,
      });
    } catch (e) {
      if (isPrismaUniqueViolation(e)) {
        const linked = await prisma.user.findUnique({
          where: { clerkId: userId },
          ...userWithSubscription,
        });
        if (linked) {
          if (!linked.subscription) {
            await ensureInactiveSubscription(linked.id);
            return loadUser(linked.id);
          }
          return linked;
        }
      }
      throw e;
    }

    if (!user.subscription) {
      await ensureInactiveSubscription(user.id);
      return loadUser(user.id);
    }

    return user;
  }

  try {
    return await prisma.user.create({
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
      ...userWithSubscription,
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      const linked = await prisma.user.findUnique({
        where: { clerkId: userId },
        ...userWithSubscription,
      });
      if (linked) {
        if (!linked.subscription) {
          await ensureInactiveSubscription(linked.id);
          return loadUser(linked.id);
        }
        return linked;
      }

      const byEmail = await prisma.user.findUnique({
        where: { email },
        ...userWithSubscription,
      });
      if (byEmail) {
        if (!byEmail.subscription) {
          await ensureInactiveSubscription(byEmail.id);
          return loadUser(byEmail.id);
        }
        return byEmail;
      }
    }
    throw e;
  }
}

export async function requireAdminUserRecord() {
  const user = await requireUserRecord();
  if (!isAdminEmail(user.email)) {
    throw new Error("Forbidden");
  }
  return user;
}
