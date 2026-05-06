import { sendResendEmail } from "@/lib/resend-email";

type AuditPublishedEmailInput = {
  toEmail: string;
  auditId: string;
  targetUrl: string;
  targetKeyword: string;
};

export async function sendAuditPublishedEmail(input: AuditPublishedEmailInput) {
  const subject = `[TrafficLift] Your audit is ready`;
  const html = `
    <p>Your audit is ready. Please open your user dashboard to access it.</p>
    <p><strong>Target URL:</strong> ${input.targetUrl}</p>
    <p><strong>Target keyword / goal:</strong> ${input.targetKeyword}</p>
  `;

  return sendResendEmail({ to: [input.toEmail], subject, html });
}
