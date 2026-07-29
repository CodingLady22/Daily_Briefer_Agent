# Memory — AI Digest Build (Phases 1-3 + Phase 4.1-4.4 + key normalization)

Last updated: 2026-07-29

## What was built

- **Phase 1 scaffold:** `package.json`, `tsconfig.json` (TS 7.0 — dropped `baseUrl`, added explicit `"types": ["node"]`), `.env.example`, `.env`, `src/config/index.ts` (Zod-validated env config + `getLLM(tier, maxTokens)` factory for gemini/openai/anthropic), `src/db/connection.ts`, `src/db/digest.model.ts`, `src/db/benchmarkSnapshot.model.ts`, `src/types/index.ts`, `src/index.ts`.
- **Phase 2:** `src/graph/state.ts` (`DigestState` annotation), `src/graph/supervisor.ts`, `src/graph/graph.ts` (supervisor → webSearch/benchmark/pricing parallel → synthesis → personalization → emailFormatter → END), six stub agent files in `src/agents/`.
- **Phase 3 tools:** `src/tools/webFetch.tool.ts`, `search.tool.ts` (Tavily), `benchmarkScraper.tool.ts`, `pricingScraper.tool.ts`.
- **Phase 4.1 — WebSearch agent:** `src/agents/webSearch.agent.ts` + `webSearch.prompt.ts`.
- **Phase 4.2 — Benchmark agent:** `src/agents/benchmark.agent.ts` + `benchmark.prompt.ts`. Post-4.2 code review fixed 6 issues, now permanent rules in `architecture.md` (13–16) and `code-standards.md`.
- **Phase 4.3 — Pricing agent:** `src/db/pricingSnapshot.model.ts`, `src/agents/pricing.agent.ts` + `pricing.prompt.ts`, `PricingDelta.significant` field added to `types/index.ts`.
- **This session — key normalization fix:** New `src/utils/key.ts` exporting `normalizeKey(a, b)` (lowercase, trim, collapse spaces/underscores to single hyphens). Replaces the local `scoreKey`/`priceKey` helpers previously duplicated in `benchmark.agent.ts` and `pricing.agent.ts` — now both import the shared helper and use it everywhere a dedup/diff key is built (dedupe, previous-snapshot lookup, current-vs-previous match). Normalizes ONLY the lookup key; stored/displayed `modelName` always stays the original extracted string. Explicitly NOT fuzzy/edit-distance/embedding matching or LLM canonicalization — those are noted as v2 in a code comment. Codified as an extension to `architecture.md` rule 14 and in `library-docs.md`'s Mongoose dedupe section.
- **This session — Phase 4.4 Synthesis agent:** `src/agents/synthesis.agent.ts` + `synthesis.prompt.ts` (new). First agent to call `getLLM("premium", 8192)`. Single structured-output LLM call takes `{rawItems, benchmarkDeltas, pricingDeltas}` as one JSON payload, groups into the six `project-overview.md` categories (skips a category entirely if it has zero items — code adds a defensive filter for the same case), writes a 2–4 sentence narrative per category, and produces a `comparisonTable` (mandatory when "Benchmark movements" or "Pricing & rate limit changes" has 2+ items, since both are inherently numeric; optional elsewhere). Item `url` must be copied exactly from the input, never invented. `comparisonTable` uses `.optional()` not `.nullable()` on the Zod schema (Gemini constraint), normalized to `null` in code.
- Dev script `src/_test-synthesis.ts` added (gitignored, `src/_test-*.ts` pattern) — runs WebSearch + Benchmark + Pricing first (like the real graph fan-out) so Synthesis gets real upstream data, not fixtures.
- All of Phases 1–3 plus 4.1–4.4 are **live-verified with real credentials**.
- Auto-committed as `feat: Build synthesis agent and key normalization fix` (commit `bebc4a8`) — confirmed this is an intentional auto-commit hook, not something to second-guess going forward.

## Decisions made

- Swapped deprecated `@langchain/community` for `@langchain/tavily` project-wide.
- Tools stay dumb fetchers (`RawItem[]` only); agents own all LLM extraction via cheap-tier calls (WebSearch/Benchmark/Pricing) or premium-tier calls (Synthesis/Personalization).
- `getLLM(tier, maxTokens)` — second argument required on every call site.
- Any optional field in a Zod schema passed to `.withStructuredOutput()` must be `.optional()`, never `.nullable()` — confirmed again this session on Synthesis's `comparisonTable` field.
- Every agent's catch block returns ONLY the new error(s) — `errors: [message]`, never spreads `state.errors` back in.
- Scraper tools use `Promise.allSettled`, return `{items, errors}`.
- Snapshot writes guarded at `MIN_SNAPSHOT_ITEMS = 5`.
- Dedup/diff keys are now normalized via the shared `normalizeKey()` helper (`src/utils/key.ts`) — lowercase/trim/hyphen-collapse only, no fuzzy matching. Applies to both Benchmark (`modelName::benchmark`) and Pricing (`modelName::provider`).
- Synthesis is a pure grouping/writing pass over state — no MongoDB read/write of its own.
- Comparison tables are **mandatory** (not just "when relevant") for Benchmark movements / Pricing sections once they have 2+ items, since those categories are inherently numeric — this is a stricter reading of build-plan.md 4.4 / success criterion #9 than the LLM applied on first pass, tightened via the prompt.
- `LLM_MODEL_PREMIUM` in `.env` changed twice this session (see Problems solved) — final working value confirmed by the user directly editing `.env`. Cost-tier code architecture (`getLLM("cheap"|"premium")`) is unchanged; only the model string changed.

## Problems solved

- TypeScript 7.0 removed tsconfig's `baseUrl` — needs `"paths"` without `baseUrl` plus explicit `"types": ["node"]`.
- `@langchain/community` deprecated upstream; moved to `@langchain/tavily`.
- Gemini's structured-output schema converter rejects `.nullable()` Zod fields — use `.optional()`, normalize `undefined → null` after the call. Recurred again this session (Synthesis's `comparisonTable`), confirming this is a durable Gemini-wide constraint, not a one-off.
- `search.tool.ts`'s `new URL(r.url).hostname` threw on relative redirect URLs — fixed with try/catch + `droppedCount` reporting.
- Post-4.2 code review found and fixed 6 issues (error double-counting, snapshot guard, dedupe-before-diff, `Promise.allSettled`, dropped-URL visibility, token headroom) — codified as permanent rules.
- Mongoose `.lean()` widened `PricingEntry.provider`'s literal union to `string` — fixed via explicit generic on `model<T>()`.
- **This session:** LLM-extracted `modelName` casing/formatting isn't stable run-to-run (e.g. `"Gemini 3.6 Flash"` vs `"gemini-3.6-flash"`), causing real dedup/diff misses across days. Fixed with the shared `normalizeKey()` helper — deliberately light (string normalization only), not fuzzy matching. Live-reverified: Benchmark and Pricing agents each ran twice in a row post-fix with 0 errors and correct cross-run matches.
- **This session:** `LLM_MODEL_PREMIUM=gemini-3.1-pro-preview` (confirmed correct in an earlier session) turned out to have a hard `limit: 0` free-tier quota — not a rate limit, a total block without billing enabled. Next attempt, `gemini-2.5-flash`, hit a 404 "no longer available to new users" (same deprecation class the cheap tier already moved off of). Resolved by the user directly setting `.env` to `LLM_MODEL_CHEAP=gemini-3.1-flash-lite` / `LLM_MODEL_PREMIUM=gemini-3.5-flash-lite`, both confirmed working live. Note premium and cheap are now both "flash-lite" family models (no Pro-tier model currently reachable on this account) — revisit `LLM_MODEL_PREMIUM` if/when a real Pro-tier model becomes available; no code changes needed, just the `.env` value.
- **This session:** Synthesis's first live output correctly grouped 3 distinct models under "Benchmark movements" but produced no `comparisonTable`, even though build-plan.md 4.4 requires one for 2+ models. Fixed by making the prompt rule compulsory (not conditional on the LLM's judgment) specifically for the two inherently-numeric categories. Re-verified live: table appeared correctly for a 6-model comparison after the fix.

## Current state

- Phases 1, 2, 3 fully complete; Phase 4.1, 4.2, 4.3, 4.4 complete — all live-verified.
- Live test result for 4.4: 3-4 sections produced per run, 0 errors, every item URL traced back to real input data, comparisonTable correctly mandatory for multi-model Benchmark/Pricing sections and correctly absent when a category (e.g. Pricing) had zero significant deltas to report.
- `.env` real values in place for MongoDB, Tavily, Gemini, OpenAI, Resend, digest-to-email. `ANTHROPIC_API_KEY` intentionally blank (user's Anthropic account has an unresolved issue). `LLM_MODEL_CHEAP=gemini-3.1-flash-lite`, `LLM_MODEL_PREMIUM=gemini-3.5-flash-lite` (both confirmed working). `RESEND_FROM` DNS-verified in Resend.
- Standing workflow agreement: stop after each individual build-plan checklist item (not each phase) for manual testing before starting the next one.
- Confirmed: the `feat: ...` auto-commits after each session are an intentional hook, not something to flag going forward.
- `_test-<agent>.ts` dev scripts are being kept long-term (not just through Phase 4) — useful for diagnosing a failing agent in production during the first couple of weeks post-launch.

## Next session starts with

**Phase 4.5 — Personalization agent** (`src/agents/personalization.agent.ts` + `personalization.prompt.ts`). Re-read the Personalization sections of `project-overview.md`, `architecture.md`, and build-plan.md 4.5 first. Carry forward from 4.1–4.4:
- Call `getLLM("premium", maxTokens)` — same tier as Synthesis.
- Any optional Zod field passed to `.withStructuredOutput()` must be `.optional()`, not `.nullable()`.
- Receives `sections: DigestSection[]` from state; reorders sections so TypeScript/LangGraph-relevant items surface first (still includes Python-only content, just deprioritized); adds a "Why this matters for you" note (1 sentence) to the top 3 items; marks each item `priority: true`/`false`; returns `PersonalisedDigest` (`{ sections: PersonalisedSection[] }` per `types/index.ts`).
- Personalisation context to bake into the prompt: LangGraph (JS/TS) agent building, RAG pipelines, WhatsApp-first interfaces, observability (LangSmith/Weave/Phoenix), guardrails (Guardrails AI/NeMo), transitioning into applied AI engineering roles.
- No MongoDB or tool calls needed — pure reordering/annotation pass over `state.sections`.
- Build only this one checklist item, then stop for manual testing before starting 4.6.

## Open questions

- None outstanding — both open questions from the previous memory (auto-commit hook, `_test-*.ts` script retention) were resolved by the user this session.
