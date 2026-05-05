import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUserRecordOrThrow } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

const listSchema = z.object({
  q: z.string().optional().default(""),
  status: z.enum(["ALL", "QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional().default("ALL"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(req: Request) {
  try {
    await requireAdminUserRecordOrThrow();
    const url = new URL(req.url);
    const parsed = listSchema.safeParse({
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "ALL",
      limit: url.searchParams.get("limit") ?? "50",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const q = parsed.data.q.trim().toLowerCase();
    const statusFilter =
      parsed.data.status === "ALL" ? undefined : (parsed.data.status as AuditStatus);

    const audits = await prisma.audit.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(q
          ? {
              OR: [
                { targetUrl: { contains: q, mode: "insensitive" } },
                { targetKeyword: { contains: q, mode: "insensitive" } },
                { id: { contains: q, mode: "insensitive" } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      include: {
        user: { select: { email: true } },
      },
    });

    return NextResponse.json({
      audits: audits.map((audit) => ({
        id: audit.id,
        email: audit.user.email,
        targetUrl: audit.targetUrl,
        targetKeyword: audit.targetKeyword,
        status: audit.status,
        createdAt: audit.createdAt.toISOString(),
      })),
    });
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
