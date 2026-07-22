// Renders the personalised digest into the final Gmail-safe HTML email payload.
import type { DigestStateType } from "../graph/state.js";

export async function emailFormatterAgent(
  _state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  console.log("emailFormatter agent stub running");
  return { emailPayload: null };
}
