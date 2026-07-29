# Memory — AI Digest Build (Phases 1-3 + Phase 4.1-4.3)

Last updated: 2026-07-29

## What was built

- **Phase 1 scaffold:** `package.json`, `tsconfig.json` (TS 7.0 — dropped `baseUrl`, added explicit `"types": ["node"]`), `.env.example`, `.env`, `src/config/index.ts` (Zod-validated env config + `getLLM(tier, maxTokens)` factory for gemini/openai/anthropic), `src/db/connection.ts`, `src/db/digest.model.ts`, `src/db/benchmarkSnapshot.model.ts`, `src/types/index.ts`, `src/index.ts`.
- **Phase 2:** `src/graph/state.ts` (`DigestState` annotation), `src/graph/supervisor.ts`, `src/graph/graph.ts` (supervisor → webSearch/benchmark/pricing parallel → synthesis → personalization → emailFormatter → END), six stub agent files in `src/agents/`.
- **Phase 3 tools:** `src/tools/webFetch.tool.ts`, `search.tool.ts` (Tavily), `benchmarkScraper.tool.ts`, `pricingScraper.tool.ts`.
- **Phase 4.1 — WebSearch agent:** `src/agents/webSearch.agent.ts` + `webSearch.prompt.ts`. One Tavily query per source from `architecture.md` (excluding Benchmarks/Pricing groups), scoped to last 24h via `timeRange: "day"` + `includeDomains`, deduped by URL, filtered against the last 7 days of `DigestRecord.sourceUrls`, then a single batched cheap-tier LLM cleanup pass.
- **Phase 4.2 — Benchmark agent:** `src/agents/benchmark.agent.ts` + `benchmark.prompt.ts`. Scrapes leaderboards, extracts `{modelName, benchmark, score, source}` via cheap-tier LLM, dedupes by `modelName::benchmark`, diffs against the last `BenchmarkSnapshot`, flags `|delta| > 2` as significant, guards the snapshot save at ≥5 items. Post-4.2 code review fixed 6 issues (error double-counting, snapshot guard, dedupe-before-diff, `Promise.allSettled`, dropped-URL visibility, token headroom) — now permanent rules in `architecture.md` (13–16) and `code-standards.md`.
- **Phase 4.3 — Pricing agent:** `src/db/pricingSnapshot.model.ts` (new — mirrors `benchmarkSnapshot.model.ts`, but passes `PricingSnapshotDocument` as an explicit generic to `model<T>()` since `PricingEntry.provider` is a literal union and Mongoose's schema-inferred read type otherwise widens it to plain `string`, which failed `tsc`). `src/agents/pricing.agent.ts` (implemented — was a stub) + `pricing.prompt.ts` (new): calls `pricingScraperTool()`, extracts `{modelName, provider, inputPer1M, outputPer1M, source}` via cheap-tier LLM (provider inferred from source hostname/model naming, since raw items aren't pre-tagged), dedupes by `modelName::provider` (sort-by-source, last-write-wins), diffs against the latest `PricingSnapshot`, guards the save at `MIN_SNAPSHOT_ITEMS = 5`. Added `significant: boolean` to the `PricingDelta` type (`types/index.ts`) — true only when a prior price exists AND differs (no >2 threshold like Benchmark; build-plan.md 4.3 says any price change is worth flagging). Rewrote `pricingScraper.tool.ts`: `Promise.all` → `Promise.allSettled`, returns `{items, errors}`, properly destructures `search()`'s `{items, droppedCount}` shape with drops surfaced to `errors[]`.
- All of Phases 1–3 plus 4.1–4.3 are **live-verified with real credentials**, not just typechecked.
- Dev scripts at `src/_test-websearch.ts`, `src/_test-benchmark.ts`, `src/_test-pricing.ts` (pattern: `src/_test-*.ts`, gitignored) let the user re-run any agent standalone without asking — more will be added per agent as Phase 4 continues.
- Committed as `feat: build pricing agent` (commit `9e5ee0f` on branch `pricingAgent`) — appears to be an auto-commit hook, not something explicitly requested this session; worth confirming that's expected before pushing.

## Decisions made

- Swapped deprecated `@langchain/community` for `@langchain/tavily` project-wide — user approved.
- `benchmarkScraper.tool.ts` and `pricingScraper.tool.ts` return raw `RawItem[]` material, not pre-structured data — no verified stable JSON API exists for the leaderboards or pricing pages, so structured extraction happens in the Phase 4 agents' cheap-tier LLM calls. Tools stay dumb fetchers; agents own all LLM calls.
- `getLLM(tier, maxTokens)` — the second argument is required on every call site, mapped per-provider (`maxOutputTokens` for Gemini, `maxTokens` for OpenAI/Anthropic).
- Any optional field in a Zod schema passed to `.withStructuredOutput()` must be `.optional()`, never `.nullable()` — Gemini's structured-output converter rejects nullable fields with a 400 error. Confirmed to also matter for future schemas (4.4 Synthesis will have optional fields).
- Every agent's catch block (and any non-fatal error return) returns ONLY the new error(s) — `errors: [message]`, never `errors: [...state.errors, message]`. The `errors` reducer in `state.ts` already appends.
- Scraper tools that fan out multiple queries/sources use `Promise.allSettled`, not `Promise.all`, and return `{items, errors}` — one failing query/source must never discard the others' results. Applied to both `benchmarkScraper.tool.ts` and (this session) `pricingScraper.tool.ts`.
- A snapshot write is skipped (previous snapshot kept as baseline) whenever fewer than `MIN_SNAPSHOT_ITEMS` (5) items were extracted — logged as a low-yield message in `errors[]`. Applies to both `BenchmarkSnapshot` and `PricingSnapshot`.
- Delta/score dedup key collapsing sorts by `source` first, then keeps the last entry per key in a `Map` — deterministic regardless of original array order. Used for `modelName::benchmark` (Benchmark) and `modelName::provider` (Pricing).
- `PricingDelta` gained a `significant: boolean` field this session (not originally in the Phase 1 type) — true only when a previous price exists and differs. Unlike Benchmark's `Math.abs(delta) > 2` threshold, Pricing flags ANY change per build-plan.md 4.3 ("price moves are rare and always worth noting").
- Mongoose models whose sub-schema has a literal-union field (like `PricingEntry.provider`) must pass the document type as an explicit generic to `model<T>()`, or `.lean()` reads widen the union to `string` and fail strict-mode `tsc`. `benchmarkSnapshot.model.ts` didn't need this since none of its fields are union types.
- Standardized on `.env` only — deleted the stale, gitignored `.env.local` (predated `.env`'s current values, had an old `RESEND_FROM`, no code ever read it). User confirmed `mayeonalabs.com` is DNS-verified in Resend, satisfying the Phase 5 send prerequisite.

## Problems solved

- TypeScript 7.0 removed tsconfig's `baseUrl` — path aliases need `"paths"` without `baseUrl`, plus explicit `"types": ["node"]`.
- `@langchain/community` deprecated upstream; moved to `@langchain/tavily`.
- Gemini's structured-output schema converter rejects `.nullable()` Zod fields — use `.optional()` instead, normalize `undefined → null` after the call.
- `search.tool.ts`'s `new URL(r.url).hostname` threw on Tavily's occasional relative redirect URLs — fixed by wrapping in try/catch and skipping unparseable results, surfaced via a `droppedCount` return field.
- A formal code review of `benchmark.agent.ts` found 6 issues (error double-counting, missing snapshot guard, missing dedupe, `Promise.all` vs `allSettled`, silently-dropped URLs, token headroom) — all fixed and codified as permanent architecture/code-standards rules.
- This session: Mongoose's `.lean()` typing widened `PricingEntry.provider` from its literal union to plain `string`, breaking `tsc` — fixed by passing `PricingSnapshotDocument` as an explicit generic to `model<T>()` in `pricingSnapshot.model.ts`.
- This session: OpenAI's pricing page (`openai.com/api/pricing`) is JS-rendered exactly as suspected in Phase 3 — confirmed live, the `pricingScraperTool`'s search fallback triggered correctly and returned usable third-party pricing-aggregator sources.

## Current state

- Phases 1, 2, 3 fully complete; Phase 4.1, 4.2, and 4.3 complete — all live-verified.
- Live test result for 4.3: two consecutive runs — first extracted 50 prices (Google/Anthropic direct-fetched, OpenAI via search fallback), 0 prior snapshot so all `significant: false`, snapshot saved; second extracted 49 prices, correctly diffed against the first run's snapshot (e.g. Anthropic's "Opus 5" matched exactly, delta none), 0 errors both runs.
- `.env` is now the single source of truth for environment config (`.env.local` deleted). Real values in place for MongoDB, Tavily, Gemini, OpenAI, Resend, digest-to-email. `ANTHROPIC_API_KEY` intentionally blank (user's Anthropic account has an unresolved issue). `RESEND_FROM` (`onboarding@mayeonalabs.com`) is confirmed DNS-verified in Resend — Phase 5 send prerequisite is now satisfied.
- Standing workflow agreement: stop after each individual build-plan checklist item (not each phase) for manual testing before starting the next one.

## Next session starts with

**Phase 4.4 — Synthesis agent** (`src/agents/synthesis.agent.ts` + `synthesis.prompt.ts`). Re-read the Synthesis sections of `project-overview.md`, `architecture.md`, and build-plan.md 4.4 first. Carry forward from 4.1–4.3:
- Call `getLLM("premium", maxTokens)` — Synthesis is the first agent to use the premium tier, not cheap.
- Any optional Zod field passed to `.withStructuredOutput()` must be `.optional()`, not `.nullable()`.
- Receives `rawItems`, `benchmarkDeltas`, and `pricingDeltas` from state; groups into the six categories from `project-overview.md`; writes a 2–4 sentence narrative per category; outputs a `comparisonTable` (`{headers, rows} | null`) whenever 2+ models/frameworks appear in the same category; every item must carry its source URL (non-negotiable project-wide rule).
- No MongoDB snapshot/delta logic needed here (that's Benchmark/Pricing's job) — Synthesis is a pure grouping/writing pass over data already in state.
- Build only this one checklist item, then stop for manual testing before starting 4.5.

## Open questions

- Was the `feat: build pricing agent` commit (9e5ee0f) an intentional auto-commit hook, or should commits be made more explicitly going forward? Worth confirming before this becomes a pattern.
- Should the `_test-<agent>.ts` dev scripts be consolidated or removed once all of Phase 4 is done, or kept indefinitely as regression-check tools?
