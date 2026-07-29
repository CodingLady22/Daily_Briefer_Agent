// Mongoose model for one pricing snapshot per run — diffed to compute deltas.
import { Schema, model } from "mongoose";
import type { PricingProvider } from "../types/index.js";

const pricingEntrySchema = new Schema(
  {
    modelName: { type: String, required: true },
    provider: { type: String, required: true },
    inputPer1M: { type: Number, required: true },
    outputPer1M: { type: Number, required: true },
    source: { type: String, required: true },
  },
  { _id: false },
);

const pricingSnapshotSchema = new Schema({
  date: { type: Date, required: true },
  prices: { type: [pricingEntrySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type PricingSnapshotDocument = {
  date: Date;
  prices: {
    modelName: string;
    provider: PricingProvider;
    inputPer1M: number;
    outputPer1M: number;
    source: string;
  }[];
  createdAt: Date;
};

// Generic doc type param keeps `provider` narrowed to `PricingProvider` on reads
// (e.g. `.lean()`) instead of widening to `string`, since PricingEntry needs the union.
export const PricingSnapshot = model<PricingSnapshotDocument>(
  "PricingSnapshot",
  pricingSnapshotSchema,
);
