// Schedules the daily digest run and wires the full post-graph pipeline:
// invoke the graph, send the email via Resend, persist a DigestRecord.
// Any fatal error is caught and reported via sendFailureAlert instead of
// crashing the process.
import cron from "node-cron";
import { config } from "../config/index.js";
import { digestGraph } from "../graph/graph.js";
import { sendDigest, sendFailureAlert } from "../email/sender.js";
import { saveDigestRecord } from "../db/digest.model.js";

async function runDigest(): Promise<void> {
  const start = Date.now();
  console.log(`AI Digest run started at ${new Date().toISOString()}`);

  const state = await digestGraph.invoke({});
  const runDurationMs = Date.now() - start;

  if (!state.emailPayload || !state.personalisedDigest) {
    throw new Error("Graph did not produce an emailPayload — nothing to send or persist");
  }

  await sendDigest(state.emailPayload);

  await saveDigestRecord({
    runDate: state.runDate,
    emailPayload: state.emailPayload,
    sections: state.personalisedDigest.sections,
    runDurationMs,
    runErrors: state.errors,
  });

  console.log(`AI Digest run finished in ${runDurationMs}ms`);
}

export function startScheduler(): void {
  // 0 7 * * 1-5 -> 07:00, Monday to Friday
  cron.schedule(
    "0 7 * * 1-5",
    async () => {
      try {
        await runDigest();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("AI Digest run failed:", reason);
        await sendFailureAlert(reason); // never let a failure go unnoticed
      }
    },
    { timezone: config.cronTimezone },
  );

  console.log(`Scheduler started (0 7 * * 1-5, timezone: ${config.cronTimezone})`);
}
