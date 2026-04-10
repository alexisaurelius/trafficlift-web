import { NextResponse } from "next/server";
import { AuditStatus } from "@prisma/client";
import { z } from "zod";
import { requireUserRecord } from "@/lib/auth-user";
import { consumeCredit, canConsumeCredit } from "@/lib/credits";
import { runAuditJob } from "@/lib/audit-engine";
import { enqueueAuditJob, isAuditQueueConfigured } from "@/lib/audit-queue";
import { prisma } from "@/lib/prisma";

const createAuditSchema = z.object({
  targetUrl: z.string().url(),
  targetKeyword: z.string().min(2).max(120),
});
const MAX_ACTIVE_AUDITS_PER_USER = Number(process.env.MAX_ACTIVE_AUDITS_PER_USER ?? 8);

export async function GET() {
  try {
    const user = await requireUserRecord();
    const audits = await prisma.audit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        targetUrl: true,
        targetKeyword: true,
        status: true,
        score: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });
    return NextResponse.json({ audits });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUserRecord();
    const body = await req.json();
    const parsed = createAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const hasCredit = await canConsumeCredit(user.id);
    if (!hasCredit) {
      return NextResponse.json(
        { error: "No credits available. Purchase or renew a plan first." },
        { status: 402 },
      );
    }

    const activeAuditsCount = await prisma.audit.count({
      where: {
        userId: user.id,
        status: {
          in: [AuditStatus.QUEUED, AuditStatus.RUNNING],
        },
      },
    });
    if (activeAuditsCount >= MAX_ACTIVE_AUDITS_PER_USER) {
      return NextResponse.json(
        {
          error: `You already have ${MAX_ACTIVE_AUDITS_PER_USER} active audits running. Please wait for completion.`,
        },
        { status: 429 },
      );
    }

    const audit = await prisma.audit.create({
      data: {
        userId: user.id,
        targetUrl: parsed.data.targetUrl,
        targetKeyword: parsed.data.targetKeyword,
        status: AuditStatus.QUEUED,
      },
    });

    await consumeCredit(user.id, "Audit requested", audit.id);
    if (isAuditQueueConfigured()) {
      await enqueueAuditJob(audit.id);
    } else {
      runAuditJob(audit.id).catch(() => {
        // error is persisted in runAuditJob
      });
    }

    return NextResponse.json({ auditId: audit.id, status: audit.status }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
