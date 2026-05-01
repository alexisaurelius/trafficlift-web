import { sendResendEmail } from "@/lib/resend-email";

type ManualAuditAlertInput = {
  auditId: string;
  auditType: "seo" | "cro";
  userEmail: string;
  targetUrl: string;
  targetKeyword: string;
  createdAt: Date;
};

export async function sendManualAuditAlert(input: ManualAuditAlertInput) {
  const alertTo = process.env.AUDIT_ALERT_EMAIL;

  if (!alertTo) {
    console.warn("[manual-audit-alert] Skipped alert; missing AUDIT_ALERT_EMAIL", {
      auditId: input.auditId,
      auditType: input.auditType,
      userEmail: input.userEmail,
      targetUrl: input.targetUrl,
    });
    return { sent: false as const, reason: "missing-config" as const };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.trafficlift.ai").replace(/\/$/, "");
  const adminUrl = `${appUrl}/dashboard/admin/${input.auditId}`;
  const keywordLine = input.auditType === "seo" ? input.targetKeyword : "CRO audit request";
  const subject = `[TrafficLift] New ${input.auditType.toUpperCase()} manual audit request`;
  const html = `
    <h2>New manual audit request</h2>
    <p><strong>Admin URL:</strong> <a href="${adminUrl}">${adminUrl}</a></p>
    <p><strong>Audit ID:</strong> <code>${input.auditId}</code></p>
    <p><strong>Audit Type:</strong> ${input.auditType.toUpperCase()}</p>
    <p><strong>User Email:</strong> ${input.userEmail}</p>
    <p><strong>Target URL:</strong> <a href="${input.targetUrl}">${input.targetUrl}</a></p>
    <p><strong>Target Keyword:</strong> ${keywordLine}</p>
    <p><strong>Requested At (UTC):</strong> ${input.createdAt.toISOString()}</p>
    <hr />
    <p style="color:#475569;font-size:13px">
      Open the Admin URL above to review the request and upload the completed audit (Form or Paste JSON tab).
    </p>
  `;

  return sendResendEmail({ to: [alertTo], subject, html });
}
