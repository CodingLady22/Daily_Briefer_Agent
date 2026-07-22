// Groups raw items and deltas into narrated, source-cited digest sections.
import type { DigestStateType } from "../graph/state.js";

export async function synthesisAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("synthesis agent stub running");
  return { sections: [] };
}
