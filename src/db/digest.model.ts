// Mongoose model for every sent digest email — used for history and 7-day dedup.
import { Schema, model } from "mongoose";
import type { EmailPayload, PersonalisedSection } from "../types/index.js";

const digestSchema = new Schema({
  date: { type: Date, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  sections: { type: Array, default: [] },
  sourceUrls: { type: [String], default: [] },
  itemCount: { type: Number, default: 0 },
  runDurationMs: { type: Number, default: 0 },
  // Named `runErrors`, not `errors` — Mongoose Documents reserve `.errors` for
  // ValidationError storage, so a schema field of that name shadows it.
  runErrors: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type DigestRecordDocument = {
  date: Date;
  subject: string;
  html: string;
  // Stores the final PersonalisedSection[] (priority + whyThisMatters included),
  // not the pre-personalization DigestSection[] — this is what was actually emailed.
  sections: PersonalisedSection[];
  sourceUrls: string[];
  itemCount: number;
  runDurationMs: number;
  runErrors: string[];
  createdAt: Date;
};

export const DigestRecord = model("DigestRecord", digestSchema);

// Builds and saves a DigestRecord from a completed run's final sections + email
// payload. Decoupled from DigestStateType on purpose — this file stays agnostic
// of the LangGraph state shape; the caller extracts what it needs from state.
export async function saveDigestRecord(input: {
  runDate: string;
  emailPayload: EmailPayload;
  sections: PersonalisedSection[];
  runDurationMs: number;
  runErrors: string[];
}): Promise<void> {
  const sourceUrls = [
    ...new Set(input.sections.flatMap((section) => section.items.map((item) => item.url))),
  ];
  const itemCount = input.sections.reduce((sum, section) => sum + section.items.length, 0);

  await DigestRecord.create({
    date: new Date(input.runDate),
    subject: input.emailPayload.subject,
    html: input.emailPayload.html,
    sections: input.sections,
    sourceUrls,
    itemCount,
    runDurationMs: input.runDurationMs,
    runErrors: input.runErrors,
  });
}
