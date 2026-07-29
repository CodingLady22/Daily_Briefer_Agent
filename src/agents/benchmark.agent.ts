// Scrapes benchmark leaderboards and diffs scores against the last MongoDB snapshot.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { benchmarkScraperTool } from "../tools/benchmarkScraper.tool.js";
import { BenchmarkSnapshot } from "../db/benchmarkSnapshot.model.js";
import { BENCHMARK_SYSTEM_PROMPT } from "./benchmark.prompt.js";
import { normalizeKey } from "../utils/key.js";
import type { DigestStateType } from "../graph/state.js";
import type { BenchmarkDelta, BenchmarkScore } from "../types/index.js";

// Scales with leaderboard coverage — live runs have already extracted 40-50+
// scores in one structured-output pass. If a parse ever fails on length, chunk
// the extraction into multiple calls rather than raising this indefinitely.
const MAX_TOKENS = 8192;
const SIGNIFICANT_DELTA_THRESHOLD = 2;
const MIN_SNAPSHOT_ITEMS = 5;

const BenchmarkScoreSchema = z.object({
  modelName: z.string(),
  benchmark: z.string(),
  score: z.number(),
  source: z.string().url(),
});

const BenchmarkScoresSchema = z.object({
  scores: z.array(BenchmarkScoreSchema),
});

// Cross-citing sources (e.g. a HELM page quoting Arena numbers) can yield the same
// model+benchmark pair more than once. Sort by source first so collapsing to one
// row per key is deterministic — last write (alphabetically last source) wins.
// Keys are normalized (see utils/key.ts) so casing/spacing variants collapse together;
// the stored score keeps the original, non-normalized modelName for display.
function dedupeScores(scores: BenchmarkScore[]): BenchmarkScore[] {
  const sorted = [...scores].sort((a, b) => a.source.localeCompare(b.source));
  const byKey = new Map<string, BenchmarkScore>();
  for (const score of sorted) {
    byKey.set(normalizeKey(score.modelName, score.benchmark), score);
  }
  return [...byKey.values()];
}

// Diffs current scores against the previous snapshot, per model per benchmark.
// Deltas over the threshold (either direction) are flagged significant.
function calculateDeltas(
  currentScores: BenchmarkScore[],
  previousScores: BenchmarkScore[],
): BenchmarkDelta[] {
  const previousByKey = new Map<string, number>();
  for (const prev of previousScores) {
    previousByKey.set(normalizeKey(prev.modelName, prev.benchmark), prev.score);
  }

  return currentScores.map((current) => {
    const previousScore =
      previousByKey.get(normalizeKey(current.modelName, current.benchmark)) ?? null;
    const delta = previousScore === null ? null : current.score - previousScore;
    const significant = delta !== null && Math.abs(delta) > SIGNIFICANT_DELTA_THRESHOLD;
    return {
      modelName: current.modelName,
      benchmark: current.benchmark,
      previousScore,
      currentScore: current.score,
      delta,
      significant,
      source: current.source,
    };
  });
}

export async function benchmarkAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  try {
    const { items: rawItems, errors: scraperErrors } = await benchmarkScraperTool();

    const llm = getLLM("cheap", MAX_TOKENS).withStructuredOutput(BenchmarkScoresSchema);
    const extracted = await llm.invoke([
      new SystemMessage(BENCHMARK_SYSTEM_PROMPT),
      new HumanMessage(JSON.stringify(rawItems)),
    ]);
    const currentScores = dedupeScores(extracted.scores);

    const previousSnapshot = await BenchmarkSnapshot.findOne().sort({ date: -1 }).lean();
    const previousScores: BenchmarkScore[] = previousSnapshot?.scores ?? [];

    const benchmarkDeltas = calculateDeltas(currentScores, previousScores);

    if (currentScores.length < MIN_SNAPSHOT_ITEMS) {
      // A bad scrape must never destroy the diff history — skip the write and
      // keep the previous snapshot as tomorrow's baseline.
      return {
        benchmarkDeltas,
        errors: [
          ...scraperErrors,
          `Benchmark: low-yield extraction (${currentScores.length} scores), snapshot not saved`,
        ],
      };
    }

    // Save before the run ends so tomorrow's run has something to diff against.
    await BenchmarkSnapshot.create({
      date: new Date(state.runDate),
      scores: currentScores,
    });

    return { benchmarkDeltas, errors: scraperErrors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`Benchmark: ${message}`] };
  }
}
