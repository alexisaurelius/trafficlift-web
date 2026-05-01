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

  const keywordLine = input.auditType === "seo" ? input.targetKeyword : "CRO audit request";
  const subject = `[TrafficLift] New ${input.auditType.toUpperCase()} manual audit request`;
  const html = `
    <h2>New manual audit request</h2>
    <p><strong>Audit ID:</strong> ${input.auditId}</p>
    <p><strong>Audit Type:</strong> ${input.auditType.toUpperCase()}</p>
    <p><strong>User Email:</strong> ${input.userEmail}</p>
    <p><strong>Target URL:</strong> ${input.targetUrl}</p>
    <p><strong>Target Keyword:</strong> ${keywordLine}</p>
    <p><strong>Requested At (UTC):</strong> ${input.createdAt.toISOString()}</p>
  `;

  return sendResendEmail({ to: [alertTo], subject, html });
}
