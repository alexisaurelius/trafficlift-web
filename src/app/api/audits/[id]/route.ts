import { NextResponse } from "next/server";
import { requireUserRecord } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUserRecord();
    const { id } = await params;
    const audit = await prisma.audit.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        checks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    return NextResponse.json({ audit });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
