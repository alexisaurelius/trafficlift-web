import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

function buildShareToken() {
  return randomUUID().replace(/-/g, "");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUserRecord();
    const { id } = await params;
    const audit = await prisma.audit.findFirst({
      where: { id, userId: user.id },
      select: { id: true, shareToken: true },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    let shareToken = audit.shareToken;
    if (!shareToken) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const candidate = buildShareToken();
        try {
          const updated = await prisma.audit.update({
            where: { id: audit.id },
            data: { shareToken: candidate },
            select: { shareToken: true },
          });
          shareToken = updated.shareToken;
          break;
        } catch {
          // Retry on rare unique collisions.
        }
      }
    }

    if (!shareToken) {
      return NextResponse.json({ error: "Could not generate share link" }, { status: 500 });
    }

    const origin = new URL(req.url).origin;
    const shareUrl = `${origin}/shared-report/${shareToken}`;
    return NextResponse.json({ shareUrl, shareToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
