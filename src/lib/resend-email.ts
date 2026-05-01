type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
};

export async function sendResendEmail(input: SendEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.AUDIT_PUBLISHED_FROM_EMAIL ??
    process.env.AUDIT_ALERT_FROM_EMAIL ??
    "TrafficLift <onboarding@resend.dev>";

  if (!resendApiKey) {
    console.warn("[resend-email] Missing RESEND_API_KEY; email skipped", { subject: input.subject });
    return { sent: false as const, reason: "missing-config" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    console.error("[resend-email] Failed to send email", {
      status: response.status,
      body: failureText,
      subject: input.subject,
    });
    return { sent: false as const, reason: "provider-error" as const };
  }

  return { sent: true as const };
}
