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

export type BenchmarkScraperResult = {
  items: RawItem[];
  errors: string[];
};

// Promise.allSettled — one query failing (e.g. a rate-limited source) must not
// discard the other two's results.
export async function benchmarkScraperTool(): Promise<BenchmarkScraperResult> {
  const settled = await Promise.allSettled(BENCHMARK_QUERIES.map((query) => search(query)));

  const items: RawItem[] = [];
  const errors: string[] = [];

  settled.forEach((result, i) => {
    const query = BENCHMARK_QUERIES[i];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      if (result.value.droppedCount > 0) {
        errors.push(`search: skipped ${result.value.droppedCount} unparseable URLs (${query})`);
      }
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`benchmarkScraper: ${query} failed - ${reason}`);
    }
  });

  return { items, errors };
}
