// Scrapes benchmark leaderboards and diffs scores against the last MongoDB snapshot.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { benchmarkScraperTool } from "../tools/benchmarkScraper.tool.js";
import { BenchmarkSnapshot } from "../db/benchmarkSnapshot.model.js";
import { BENCHMARK_SYSTEM_PROMPT } from "./benchmark.prompt.js";
import type { DigestStateType } from "../graph/state.js";
import type { BenchmarkDelta, BenchmarkScore } from "../types/index.js";

const MAX_TOKENS = 4096;
const SIGNIFICANT_DELTA_THRESHOLD = 2;

const BenchmarkScoreSchema = z.object({
  modelName: z.string(),
  benchmark: z.string(),
  score: z.number(),
  source: z.string().url(),
});

const BenchmarkScoresSchema = z.object({
  scores: z.array(BenchmarkScoreSchema),
});

function scoreKey(modelName: string, benchmark: string): string {
  return `${modelName}::${benchmark}`;
}

// Diffs current scores against the previous snapshot, per model per benchmark.
// Deltas over the threshold (either direction) are flagged significant.
function calculateDeltas(
  currentScores: BenchmarkScore[],
  previousScores: BenchmarkScore[],
): BenchmarkDelta[] {
  const previousByKey = new Map<string, number>();
  for (const prev of previousScores) {
    previousByKey.set(scoreKey(prev.modelName, prev.benchmark), prev.score);
  }

  return currentScores.map((current) => {
    const previousScore =
      previousByKey.get(scoreKey(current.modelName, current.benchmark)) ?? null;
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
    const rawItems = await benchmarkScraperTool();

    const llm = getLLM("cheap", MAX_TOKENS).withStructuredOutput(BenchmarkScoresSchema);
    const extracted = await llm.invoke([
      new SystemMessage(BENCHMARK_SYSTEM_PROMPT),
      new HumanMessage(JSON.stringify(rawItems)),
    ]);
    const currentScores: BenchmarkScore[] = extracted.scores;

    const previousSnapshot = await BenchmarkSnapshot.findOne().sort({ date: -1 }).lean();
    const previousScores: BenchmarkScore[] = previousSnapshot?.scores ?? [];

    const benchmarkDeltas = calculateDeltas(currentScores, previousScores);

    // Save before the run ends so tomorrow's run has something to diff against.
    await BenchmarkSnapshot.create({
      date: new Date(state.runDate),
      scores: currentScores,
    });

    return { benchmarkDeltas };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [...state.errors, `Benchmark: ${message}`] };
  }
}
