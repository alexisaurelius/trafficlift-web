import { NextResponse } from "next/server";
import { AuditStatus } from "@prisma/client";
import { z } from "zod";
import { requireUserRecord } from "@/lib/auth-user";
import { consumeCredit, canConsumeCredit } from "@/lib/credits";
import { sendManualAuditAlert } from "@/lib/manual-audit-alert";

/** Manual-audit request endpoint. */
export const maxDuration = 300;
import { formatKeywordCandidatesAsQuotedList, parseKeywordCandidates } from "@/lib/keyword-match";
import { CRO_AUDIT_KEYWORD } from "@/lib/audit-mode";
import { prisma } from "@/lib/prisma";

const createAuditSchema = z.object({
  targetUrl: z.string().url(),
  targetKeyword: z.string().max(360).optional().default(""),
  auditType: z.enum(["seo", "cro"]).optional().default("seo"),
});
const MAX_ACTIVE_AUDITS_PER_USER = Number(process.env.MAX_ACTIVE_AUDITS_PER_USER ?? 8);

export async function GET(req: Request) {
  try {
    const user = await requireUserRecord();
    const searchParams = new URL(req.url).searchParams;
    const typeParam = searchParams.get("type");
    const where =
      typeParam === "cro"
        ? { userId: user.id, targetKeyword: CRO_AUDIT_KEYWORD }
        : typeParam === "seo"
          ? { userId: user.id, targetKeyword: { not: CRO_AUDIT_KEYWORD } }
          : { userId: user.id };
    const audits = await prisma.audit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
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

    const keywordCandidates = parseKeywordCandidates(parsed.data.targetKeyword);
    const isCroAudit = parsed.data.auditType === "cro";
    if (!isCroAudit) {
      if (keywordCandidates.length === 0 || keywordCandidates.length > 3) {
        return NextResponse.json(
          { error: "Provide 1 to 3 target keywords separated by commas." },
          { status: 400 },
        );
      }
      if (keywordCandidates.some((keyword) => keyword.length < 2 || keyword.length > 120)) {
        return NextResponse.json(
          { error: "Each target keyword must be between 2 and 120 characters." },
          { status: 400 },
        );
      }
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
        targetKeyword: isCroAudit ? CRO_AUDIT_KEYWORD : formatKeywordCandidatesAsQuotedList(keywordCandidates),
        status: AuditStatus.QUEUED,
        summary: "Manual audit request received. Delivery target is within 24 hours.",
      },
    });

    await consumeCredit(user.id, "Audit requested", audit.id);
    await sendManualAuditAlert({
      auditId: audit.id,
      auditType: isCroAudit ? "cro" : "seo",
      userEmail: user.email,
      targetUrl: parsed.data.targetUrl,
      targetKeyword: isCroAudit ? "CRO audit request" : formatKeywordCandidatesAsQuotedList(keywordCandidates),
      createdAt: audit.createdAt,
    });

    return NextResponse.json({ auditId: audit.id, status: audit.status }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
