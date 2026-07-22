// Reorders sections for the user's stack and flags priority items with "why this matters" notes.
import type { DigestStateType } from "../graph/state.js";

export async function personalizationAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("personalization agent stub running");
  return { personalisedDigest: null };
}
