import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { sendAuditPublishedEmail } from "@/lib/audit-published-email";

const manualCheckRowSchema = z.object({
  key: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  status: z.enum(["pass", "fail", "warn", "skipped"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  details: z.string().max(20000).nullable().optional(),
  recommendation: z.string().max(20000).nullable().optional(),
});

const updateAuditSchema = z.object({
  reportMarkdown: z.string().optional().default(""),
  summary: z.string().optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional().default("COMPLETED"),
  errorMessage: z.string().optional().nullable(),
  saveDraft: z.boolean().optional().default(false),
  publish: z.boolean().optional().default(false),
  notifyUser: z.boolean().optional().default(true),
  /** When set, replaces all `AuditCheck` rows for this audit (manual upload). Omit to leave checks unchanged. */
  checks: z.array(manualCheckRowSchema).optional(),
  /** Text-block uploads. Each block contains `**Item: ...**` entries with Current state / Analysis / Status. */
  onPageContent: z.string().max(50000).optional().nullable(),
  techPerfContent: z.string().max(50000).optional().nullable(),
  authorityContent: z.string().max(50000).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUserRecord();
    const { id } = await params;
    const audit = await prisma.audit.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        checks: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }
    return NextResponse.json({ audit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUserRecord();
    const body = await req.json();
    const parsed = updateAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const data = parsed.data;
    const existing = await prisma.audit.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    let nextStatus = data.status as AuditStatus;
    if (data.saveDraft) {
      nextStatus = AuditStatus.RUNNING;
    }
    if (data.publish) {
      nextStatus = AuditStatus.COMPLETED;
    }

    // Empty strings should clear the column rather than store whitespace.
    const normalizeText = (value: string | null | undefined) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value.trim().length === 0 ? null : value;
    };
    const onPageContent = normalizeText(data.onPageContent);
    const techPerfContent = normalizeText(data.techPerfContent);
    const authorityContent = normalizeText(data.authorityContent);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.checks) {
        await tx.auditCheck.deleteMany({ where: { auditId: id } });
        if (data.checks.length > 0) {
          await tx.auditCheck.createMany({
            data: data.checks.map((row) => ({
              auditId: id,
              key: row.key,
              title: row.title,
              status: row.status,
              priority: row.priority,
              details: row.details ?? null,
              recommendation: row.recommendation ?? null,
            })),
          });
        }
      }

      return tx.audit.update({
        where: { id },
        data: {
          reportMarkdown: data.reportMarkdown,
          summary: data.summary ?? null,
          score: data.score ?? null,
          status: nextStatus,
          errorMessage: data.errorMessage ?? null,
          completedAt: nextStatus === AuditStatus.COMPLETED ? new Date() : null,
          ...(onPageContent !== undefined ? { onPageContent } : {}),
          ...(techPerfContent !== undefined ? { techPerfContent } : {}),
          ...(authorityContent !== undefined ? { authorityContent } : {}),
        },
        select: {
          id: true,
          status: true,
          completedAt: true,
          targetUrl: true,
          targetKeyword: true,
        },
      });
    });

    let emailResult: Awaited<ReturnType<typeof sendAuditPublishedEmail>> | null = null;
    if (data.publish && data.notifyUser) {
      emailResult = await sendAuditPublishedEmail({
        toEmail: existing.user.email,
        auditId: updated.id,
        targetUrl: updated.targetUrl,
        targetKeyword: updated.targetKeyword,
      });
    }

    return NextResponse.json({ ok: true, audit: updated, email: emailResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
