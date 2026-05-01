import { NextResponse } from "next/server";
import { buildSpec, buildStarterTemplate, type AuditMode } from "@/lib/admin-audit-upload";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode");
  if (modeParam === "seo" || modeParam === "cro") {
    const mode = modeParam as AuditMode;
    return NextResponse.json({
      mode,
      starterTemplate: buildStarterTemplate(mode),
      spec: buildSpec(),
    });
  }
  return NextResponse.json(buildSpec());
}
