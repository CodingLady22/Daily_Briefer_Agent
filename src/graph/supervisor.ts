// Entry node: logs run start, stamps runDate, and hands off to the parallel research agents.
import type { DigestStateType } from "./state.js";

export async function supervisorNode(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  const runDate = new Date().toISOString();
  console.log(`AI Digest run started at ${runDate}`);
  return { runDate };
}
