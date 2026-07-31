// App entry point: connects to MongoDB and starts the cron scheduler.
import { connectDB } from "./db/connection.js";
import { startScheduler } from "./scheduler/cron.js";

async function main(): Promise<void> {
  await connectDB();
  startScheduler();
  console.log("AI Digest started");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal startup error: ${message}`);
  process.exit(1);
});
