// One-shot entry for Railway's native cron: connects to MongoDB, runs one full
// digest (research -> synthesis -> personalization -> email), sends it, persists
// a DigestRecord, then exits. Railway only bills while the container is running,
// so the process must always terminate on its own — see the disconnect + exit in
// both the success and failure paths below. Never left open, or the container
// (and the bill for it) never stops.
import mongoose from "mongoose";
import { connectDB } from "./db/connection.js";
import { digestGraph } from "./graph/graph.js";
import { sendDigest, sendFailureAlert } from "./email/sender.js";
import { saveDigestRecord } from "./db/digest.model.js";

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

  const itemCount = state.personalisedDigest.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  console.log(
    `AI Digest run finished in ${runDurationMs}ms — ${state.personalisedDigest.sections.length} sections, ${itemCount} items, ${state.errors.length} non-fatal error(s)`,
  );
}

async function main(): Promise<void> {
  try {
    await connectDB();
    await runDigest();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("AI Digest run failed:", reason);

    try {
      await sendFailureAlert(reason); // never let a failure go unnoticed
    } catch (alertErr) {
      const alertMessage = alertErr instanceof Error ? alertErr.message : String(alertErr);
      console.error("Failed to send failure alert:", alertMessage);
    }

    // Only a connection that was actually opened needs closing (connectDB()
    // itself may be what failed).
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

main();
