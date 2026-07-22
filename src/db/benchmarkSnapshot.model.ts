// Mongoose model for one benchmark score snapshot per run — diffed to compute deltas.
import { Schema, model } from "mongoose";

const benchmarkScoreSchema = new Schema(
  {
    modelName: { type: String, required: true },
    benchmark: { type: String, required: true },
    score: { type: Number, required: true },
    source: { type: String, required: true },
  },
  { _id: false },
);

const benchmarkSnapshotSchema = new Schema({
  date: { type: Date, required: true },
  scores: { type: [benchmarkScoreSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type BenchmarkSnapshotDocument = {
  date: Date;
  scores: {
    modelName: string;
    benchmark: string;
    score: number;
    source: string;
  }[];
  createdAt: Date;
};

export const BenchmarkSnapshot = model(
  "BenchmarkSnapshot",
  benchmarkSnapshotSchema,
);
