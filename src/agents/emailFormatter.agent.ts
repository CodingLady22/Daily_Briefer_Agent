// Validates content and renders the personalised digest into the final EmailPayload.
import { renderEmail } from "../email/template.js";
import type { DigestStateType } from "../graph/state.js";

export async function emailFormatterAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  const { personalisedDigest, runDate } = state;

  try {
    if (
      !personalisedDigest ||
      !personalisedDigest.sections.some((section) => section.items.length > 0)
    ) {
      throw new Error("digest has zero items — refusing to send an empty email");
    }

    const html = renderEmail(personalisedDigest, runDate);
    const subject = `AI Digest — ${new Date(runDate).toDateString()}`;

    return { emailPayload: { subject, html } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`EmailFormatter: ${message}`] };
  }
}
