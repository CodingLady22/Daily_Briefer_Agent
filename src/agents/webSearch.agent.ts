// Crawls curated sources for the last 24h of AI news and dedupes against recent digests.
import type { DigestStateType } from "../graph/state.js";

export async function webSearchAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("webSearch agent stub running");
  return { rawItems: [] };
}
