// Deterministic dedup/diff key normalization shared by Benchmark and Pricing agents.
// Lowercases, trims, and collapses spaces/underscores to single hyphens so LLM-extracted
// model names that differ only in casing/spacing/underscores match across runs.
// Normalizes ONLY the lookup key — callers must keep the original extracted name for
// display/storage. Deterministic string cleanup, not fuzzy or LLM-based matching.
// v2 (not implemented): fuzzy/edit-distance/embedding matching, LLM canonicalization,
// alias maps for hard cases like "GPT-4o" vs "GPT-4o (2024-08-06)" or "gpt4o".
export function normalizeKey(a: string, b: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
  return `${norm(a)}::${norm(b)}`;
}
