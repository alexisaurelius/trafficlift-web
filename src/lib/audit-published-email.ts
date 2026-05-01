import { sendResendEmail } from "@/lib/resend-email";

type AuditPublishedEmailInput = {
  toEmail: string;
  auditId: string;
  targetUrl: string;
  targetKeyword: string;
};

export async function sendAuditPublishedEmail(input: AuditPublishedEmailInput) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.trafficlift.ai";
  const subject = `[TrafficLift] Your audit is ready`;
  const html = `
    <h2>Your audit has been published</h2>
    <p><strong>Audit ID:</strong> ${input.auditId}</p>
    <p><strong>Target URL:</strong> ${input.targetUrl}</p>
    <p><strong>Target keyword / goal:</strong> ${input.targetKeyword}</p>
    <p><a href="${appUrl}/dashboard/audits/${input.auditId}">Open your audit in TrafficLift</a></p>
  `;

  return sendResendEmail({ to: [input.toEmail], subject, html });
}
