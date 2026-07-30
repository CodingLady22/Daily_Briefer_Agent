// Sends the rendered digest email via Resend.
import { Resend } from "resend";
import { config } from "../config/index.js";
import type { EmailPayload } from "../types/index.js";

const resend = new Resend(config.resendApiKey);

export async function sendDigest(payload: EmailPayload): Promise<void> {
  const { data, error } = await resend.emails.send({
    from: config.resendFrom,
    to: config.digestToEmail,
    subject: payload.subject,
    html: payload.html,
  });

  // Resend reports failures in the response body, not always via throw.
  if (error) throw new Error(`Resend failed: ${error.message}`);

  console.log(`Digest sent, id: ${data?.id}`);
}

export async function sendFailureAlert(reason: string): Promise<void> {
  const { data, error } = await resend.emails.send({
    from: config.resendFrom,
    to: config.digestToEmail,
    subject: "AI Digest run failed",
    html: `<p>AI Digest run failed: ${reason}</p>`,
  });

  if (error) throw new Error(`Resend failed: ${error.message}`);

  console.log(`Failure alert sent, id: ${data?.id}`);
}
