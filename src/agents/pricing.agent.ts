// Scrapes provider pricing pages and diffs prices against the last MongoDB snapshot.
import type { DigestStateType } from "../graph/state.js";

export async function pricingAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("pricing agent stub running");
  return { pricingDeltas: [] };
}
