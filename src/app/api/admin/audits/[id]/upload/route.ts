import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendAuditPublishedEmail } from "@/lib/audit-published-email";

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

const headlessUploadSchema = z.object({
  score: z.number().int().min(0).max(100).nullable().optional(),
  summary: z.string().max(20000).nullable().optional(),
  status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional(),
  publish: z.boolean().optional(),
  notifyUser: z.boolean().optional(),
  onPageContent: z.string().max(50000).nullable().optional(),
  techPerfContent: z.string().max(50000).nullable().optional(),
  authorityContent: z.string().max(50000).nullable().optional(),
});

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

  const parsed = headlessUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  let nextStatus: AuditStatus;
  if (data.publish) {
    nextStatus = AuditStatus.COMPLETED;
  } else if (data.status) {
    nextStatus = data.status as AuditStatus;
  } else {
    nextStatus = AuditStatus.RUNNING;
  }

  const normalizeText = (value: string | null | undefined) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value.trim().length === 0 ? null : value;
  };
  const onPageContent = normalizeText(data.onPageContent);
  const techPerfContent = normalizeText(data.techPerfContent);
  const authorityContent = normalizeText(data.authorityContent);

  const updated = await prisma.audit.update({
    where: { id },
    data: {
      score: data.score ?? null,
      summary: data.summary ?? null,
      status: nextStatus,
      errorMessage: null,
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
    email: emailResult,
  });
}
