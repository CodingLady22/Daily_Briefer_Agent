// App entry point: connects to MongoDB and starts the cron scheduler.
import { connectDB } from "./db/connection.js";

async function main(): Promise<void> {
  await connectDB();
  console.log("AI Digest started");
  // Cron scheduler wiring is added here in Phase 6 once src/scheduler/cron.ts exists.
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal startup error: ${message}`);
  process.exit(1);
});
