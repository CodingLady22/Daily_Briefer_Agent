// Scrapes benchmark leaderboards and diffs scores against the last MongoDB snapshot.
import type { DigestStateType } from "../graph/state.js";

export async function benchmarkAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("benchmark agent stub running");
  return { benchmarkDeltas: [] };
}
