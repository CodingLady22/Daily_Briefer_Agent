# Memory — AI Digest Build (Phases 1-3 + Phase 4.1-4.2)

Last updated: 2026-07-28

## What was built

- **Phase 1 scaffold:** `package.json`, `tsconfig.json` (TS 7.0 — dropped `baseUrl`, added explicit `"types": ["node"]`), `.env.example`, `.env`, `src/config/index.ts` (Zod-validated env config + `getLLM(tier)` factory for gemini/openai/anthropic), `src/db/connection.ts`, `src/db/digest.model.ts`, `src/db/benchmarkSnapshot.model.ts`, `src/types/index.ts`, `src/index.ts`.
- **Phase 2:** `src/graph/state.ts` (`DigestState` annotation), `src/graph/supervisor.ts`, `src/graph/graph.ts` (supervisor → webSearch/benchmark/pricing parallel → synthesis → personalization → emailFormatter → END), six stub agent files in `src/agents/`.
- **Phase 3 tools:** `src/tools/webFetch.tool.ts`, `search.tool.ts` (Tavily), `benchmarkScraper.tool.ts`, `pricingScraper.tool.ts`.
- **Phase 4.1 — WebSearch agent:** `src/agents/webSearch.agent.ts` + `src/agents/webSearch.prompt.ts`. Runs one Tavily query per source from `architecture.md` (excluding Benchmarks/Pricing groups), scoped to the last 24h via `timeRange: "day"` + `includeDomains`, dedupes by URL, filters out anything already covered in the last 7 days of `DigestRecord.sourceUrls`, then runs a single batched cheap-tier LLM cleanup pass (drops non-news hits, writes clean titles/summaries/source names).
- **Phase 4.2 — Benchmark agent:** `src/agents/benchmark.agent.ts` + `src/agents/benchmark.prompt.ts`. Calls `benchmarkScraperTool()`, runs one batched cheap-tier LLM extraction pass to pull `{modelName, benchmark, score, source}` triples out of noisy leaderboard search text, reads the most recent `BenchmarkSnapshot` from MongoDB, diffs current vs previous scores keyed by `modelName::benchmark` (`previousScore: null` when no prior match), flags `Math.abs(delta) > 2` as significant, saves the new snapshot, returns `BenchmarkDelta[]`. Whole body is one try/catch — any failure pushes to `state.errors` and returns no `benchmarkDeltas` key.
- All of Phases 1–3 plus 4.1–4.2 are **live-verified with real credentials**, not just typechecked.
- Left reusable, gitignored dev scripts at `src/_test-websearch.ts` and `src/_test-benchmark.ts` (pattern: `src/_test-*.ts`, already in `.gitignore`) so the user can re-run them anytime without asking — more `_test-<agent>.ts` scripts will be added per agent as Phase 4 continues.

## Decisions made

- Swapped deprecated `@langchain/community` for `@langchain/tavily` project-wide (`package.json`, `architecture.md`, `library-docs.md` all updated) — user approved after the deprecation was found via npm registry metadata.
- `benchmarkScraper.tool.ts` and `pricingScraper.tool.ts` return raw `RawItem[]` material, not pre-structured `BenchmarkScore[]`/`PricingEntry[]`. No verified stable JSON API exists for the HF/LiveBench/HELM leaderboards or provider pricing pages, so structured extraction is deferred to the Phase 4 Benchmark/Pricing agents' cheap-tier LLM calls. Tools stay dumb fetchers; agents own all LLM calls (keeps the cost-tier rule centralized).
- `pricingScraperTool` tries a direct `webFetch` first, falls back to Tavily search if the returned text is `null` or under 200 chars (signals a JS-rendered empty shell) — confirmed working live.
- `config/index.ts` keeps all three LLM providers (gemini/openai/anthropic) fully wired even though only Gemini + OpenAI keys are currently set. `ANTHROPIC_API_KEY` is optional and only required when `LLM_PROVIDER="anthropic"` — don't comment out Anthropic support again.
- `getLLM(tier)` → `getLLM(tier, maxTokens)` — now required on every call, mapped per-provider (`maxOutputTokens` for Gemini, `maxTokens` for OpenAI/Anthropic) to satisfy the "always bound maxTokens" rule. **Every future `getLLM()` call site (4.2 onward) must pass this second argument.**
- `search()` in `search.tool.ts` gained an optional second param `{ timeRange?, includeDomains? }`, passed through to Tavily's `.invoke()`. Backward-compatible — existing `benchmarkScraperTool`/`pricingScraperTool` calls are unaffected.
- WebSearch's per-source Tavily queries deliberately exclude the Benchmarks/Pricing source groups from `architecture.md` — those belong to the 4.2/4.3 agents.
- Benchmark agent's significance threshold uses `Math.abs(delta) > 2` (either direction), not just increases — matches project-overview.md's "significant deltas (>2 points)" wording and email-design.md's mention of "significant benchmark drops" needing the same red-flag treatment as rises.
- Delta calc matches previous vs current scores by a `modelName::benchmark` composite key (plain Map, not a DB query) — simple and correct since both come from the same-shaped `BenchmarkScore[]`.

## Problems solved

- TypeScript 7.0 removed tsconfig's `baseUrl` — path aliases need `"paths": {"@/*": ["./src/*"]}` without `baseUrl`, plus explicit `"types": ["node"]`.
- `npm install` of `@langchain/*` packages hit an ERESOLVE conflict — resolved with `--legacy-peer-deps`.
- `@langchain/community` is deprecated upstream; Tavily search moved to `@langchain/tavily` (`TavilySearch` class, `.invoke({query})` returns a typed object directly).
- Gemini 3.x model IDs (postdate this agent's training cutoff) were verified live against Google's docs, then confirmed correct by the user: `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`.
- **Gemini's structured-output schema converter rejects a `.nullable()` Zod field** — `getLLM("cheap", ...).withStructuredOutput(schema)` threw a 400 ("Proto field is not repeating, cannot start list") on `publishedAt: z.string().nullable()`. Fixed by using `.optional()` instead (works across all three providers) and normalizing `undefined → null` in code after the call. **This pattern (`.optional()`, never `.nullable()`) must be reused in every future `withStructuredOutput()` schema in this project** — it will recur in 4.2 (Benchmark), 4.3 (Pricing), and 4.4 (Synthesis) wherever an optional field exists.
- MongoDB Atlas rejected the connection until the user added their current IP to the cluster's Network Access whitelist — a one-time dev-environment step, not a code issue.
- `LLM_MODEL_CHEAP=gemini-2.5-flash-lite` (in `.env` since Phase 1) started returning a live 404 ("no longer available to new users") during 4.2 testing — a Google-side deprecation, not a code bug. Per user decision, updated to `gemini-3.5-flash-lite` in `.env` (matches what a prior session had already confirmed as correct but `.env` had never been updated to reflect — watch for this drift between memory and actual `.env` values going forward).
- **Shared tool bug in `search.tool.ts`:** `new URL(r.url).hostname` threw uncaught `TypeError: Invalid URL` whenever Tavily returned a relative redirect URL (e.g. `/goto?url=CAESaAH...`) instead of an absolute one — reproduced consistently on the LiveBench query, surfaced by the user manually re-running `_test-benchmark.ts`. Fixed by wrapping the per-result URL parse in try/catch and silently skipping any result with an unparseable URL (it can't be cited as a source anyway). This tool is shared by WebSearch, Benchmark, and the upcoming Pricing agent — re-verified both existing callers live post-fix with no regression. **Keep this defensive pattern in mind for 4.3** — Tavily's redirect-URL quirk can surface on any query, not just LiveBench.

## Current state

- Phases 1, 2, 3 fully complete; Phase 4.1 and 4.2 complete — all live-verified (see `context/progress-tracker.md` for exact live test output).
- Live test result for 4.1: 71 raw Tavily hits across 17 source queries → 30 cleaned `RawItem[]`, 0 errors, ~22s run time.
- Live test result for 4.2: two consecutive live runs (~21s apart) — first extracted 42 scores with all-null deltas (no prior snapshot), second extracted 51 scores and computed real deltas against the first run's just-saved snapshot (mostly `delta: 0`, as expected for real leaderboards 21 seconds apart). Confirms extraction, snapshot read/diff/save all work end-to-end.
- `.env` has real values for MongoDB, Tavily, Gemini, OpenAI, Resend, and digest-to-email. `ANTHROPIC_API_KEY` is intentionally blank (user's Anthropic account currently has an issue) — handled gracefully. `LLM_MODEL_CHEAP` is now `gemini-3.5-flash-lite` (was `gemini-2.5-flash-lite`, deprecated — see Problems solved).
- `RESEND_FROM` is `onboarding@mayeonalabs.com` (user's own custom domain). Domain still needs to be confirmed as added + DNS-verified in the Resend dashboard before Phase 5 send — not yet confirmed either way.
- Standing workflow agreement: stop after each individual build-plan checklist item (not each phase) for manual testing before starting the next one. Also saved in the separate persistent auto-memory system.

## Next session starts with

**Phase 4.3 — Pricing agent** (`src/agents/pricing.agent.ts`). Re-read the Pricing sections of `project-overview.md` and `architecture.md` first. Carry forward from 4.1/4.2:
- Call `getLLM("cheap", maxTokens)` — the second argument is required.
- Any optional field in a Zod schema passed to `.withStructuredOutput()` must be `.optional()`, not `.nullable()` (Gemini rejects nullable).
- Follow the same shape as `benchmark.agent.ts`: call `pricingScraperTool()` (already returns raw `RawItem[]`, tries direct fetch then falls back to search), run one batched cheap-tier LLM extraction pass into `{modelName, provider, inputPer1M, outputPer1M, source}`, read the most recent `PricingSnapshot` (`.sort({date:-1}).findOne().lean()`), diff by a `modelName::provider`-style key, flag any change (not just >2 threshold — build-plan.md 4.3 says "flag any change, price moves are rare and always worth noting"), save the new snapshot, return `PricingDelta[]`. Whole body in one try/catch.
- `PricingSnapshot` Mongoose model doesn't exist yet — `architecture.md` defines the schema (`date`, `prices: [{modelName, provider, inputPer1M, outputPer1M, source}]`, `createdAt`) but only `digest.model.ts` and `benchmarkSnapshot.model.ts` exist in `src/db/` so far. Create `src/db/pricingSnapshot.model.ts` first, matching the `benchmarkSnapshot.model.ts` pattern (typed document export, `{_id: false}` on the sub-schema).
- Build only this one checklist item, then stop for manual testing before starting 4.4.

## Open questions

- Is `mayeonalabs.com` added and DNS-verified in the Resend dashboard yet? Needs confirming before Phase 5 send.
- Should the user standardize on editing `.env` directly going forward, to stop the earlier `.env.local` mix-up from recurring?
