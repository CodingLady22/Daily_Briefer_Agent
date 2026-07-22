// Gathers raw benchmark leaderboard material for the Benchmark agent to extract scores from.
// HuggingFace, LiveBench, and HELM render scores with JavaScript, so a plain cheerio fetch
// returns an empty shell (see library-docs.md). No verified stable public JSON API was found
// for these sources, so this tool always uses the search fallback from build-plan.md 3.3 — the
// Benchmark agent (Phase 4.2) extracts structured { modelName, benchmark, score, source } scores
// from the returned text via its own LLM call.
import { search } from "./search.tool.js";
import type { RawItem } from "../types/index.js";

const BENCHMARK_QUERIES = [
  "chatbot arena leaderboard latest LLM elo scores",
  "HELM benchmark leaderboard latest model scores",
  "LiveBench leaderboard latest model scores",
];

export async function benchmarkScraperTool(): Promise<RawItem[]> {
  const results = await Promise.all(
    BENCHMARK_QUERIES.map((query) => search(query)),
  );
  return results.flat();
}
