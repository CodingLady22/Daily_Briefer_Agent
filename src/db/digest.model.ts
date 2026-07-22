// Mongoose model for every sent digest email — used for history and 7-day dedup.
import { Schema, model } from "mongoose";
import type { DigestSection } from "../types/index.js";

const digestSchema = new Schema({
  date: { type: Date, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  sections: { type: Array, default: [] },
  sourceUrls: { type: [String], default: [] },
  itemCount: { type: Number, default: 0 },
  runDurationMs: { type: Number, default: 0 },
  errors: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type DigestRecordDocument = {
  date: Date;
  subject: string;
  html: string;
  sections: DigestSection[];
  sourceUrls: string[];
  itemCount: number;
  runDurationMs: number;
  errors: string[];
  createdAt: Date;
};

export const DigestRecord = model("DigestRecord", digestSchema);
