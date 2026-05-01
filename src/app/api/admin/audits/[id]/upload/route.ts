import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAuditPublishedEmail } from "@/lib/audit-published-email";
import { auditTypeFromKeyword } from "@/lib/audit-mode";
import { validateUploadPayload } from "@/lib/admin-audit-upload";

function unauthorized(reason: string) {
  return NextResponse.json({ ok: false, error: `Unauthorized: ${reason}` }, { status: 401 });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const expected = (process.env.ADMIN_UPLOAD_TOKEN ?? "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: ADMIN_UPLOAD_TOKEN is not set." },
      { status: 503 },
    );
  }
  const provided = getBearerToken(req);
  if (!provided) return unauthorized("missing Bearer token");
  if (!constantTimeEqual(provided, expected)) return unauthorized("invalid token");

  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!audit) {
    return NextResponse.json({ ok: false, error: "Audit not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = auditTypeFromKeyword(audit.targetKeyword);
  const validation = validateUploadPayload(body, mode, { requireAllKeys: true });
  if (!validation.ok) {
    return NextResponse.json(validation, { status: 400 });
  }

  const data = validation.payload;

  let nextStatus: AuditStatus;
  if (data.publish) {
    nextStatus = AuditStatus.COMPLETED;
  } else if (data.status) {
    nextStatus = data.status as AuditStatus;
  } else {
    nextStatus = AuditStatus.RUNNING;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.auditCheck.deleteMany({ where: { auditId: id } });
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

    return tx.audit.update({
      where: { id },
      data: {
        score: data.score ?? null,
        summary: data.summary ?? null,
        reportMarkdown: data.reportMarkdown ?? null,
        status: nextStatus,
        errorMessage: null,
        completedAt: nextStatus === AuditStatus.COMPLETED ? new Date() : null,
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
  if (data.publish && data.notifyUser !== false) {
    emailResult = await sendAuditPublishedEmail({
      toEmail: audit.user.email,
      auditId: updated.id,
      targetUrl: updated.targetUrl,
      targetKeyword: updated.targetKeyword,
    });
  }

  return NextResponse.json({
    ok: true,
    audit: updated,
    unknownKeys: validation.unknownKeys,
    email: emailResult,
  });
}
