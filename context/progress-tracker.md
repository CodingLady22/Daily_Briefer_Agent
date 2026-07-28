# Progress Tracker — AI Digest

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

---

## Current Status

**Phase:** 1, 2, 3 complete; Phase 4 in progress (4.1 done)
**Last completed:** 4.1 WebSearch agent (live-verified)
**Next:** 4.2 Benchmark agent

> All required `.env` values are now in place (Gemini as `LLM_PROVIDER`; `ANTHROPIC_API_KEY` intentionally left blank — see below). `npx tsx src/index.ts` was run live and printed `MongoDB connected` / `AI Digest started` — Phase 1 exit check passed for real. `search.tool.ts`, `benchmarkScraper.tool.ts`, and `pricingScraper.tool.ts` were all live-tested with the real `TAVILY_API_KEY` and returned correctly typed `RawItem[]` data — Phase 3 exit check passed for real.
> `ANTHROPIC_API_KEY` is blank because of an account issue on the user's side — this is fine as-is. `src/config/index.ts` fully supports all three providers (gemini/openai/anthropic); the schema, refine check, and `getLLM()` switch only require whichever provider's key matches `LLM_PROVIDER`. Do not special-case or comment out Anthropic support again — nothing needs to change here once the account issue clears, just set `LLM_PROVIDER=anthropic` and fill in the key.
> Resolved: user confirmed `gemini-3.1-pro-preview` is the correct official model ID — no further action needed for `LLM_MODEL_PREMIUM`.
> Resolved: `RESEND_FROM` now set to `onboarding@mayeonalabs.com` — user owns and controls the `mayeonalabs.com` custom domain, so this satisfies Resend's verified-domain requirement (the free-mail rejection rule doesn't apply here). Domain must be added + DNS-verified in the Resend dashboard before Phase 5 send time, but no code or `.env` change is needed.
> Workflow note: going forward, stop after each individual checklist item (not each phase) for manual testing/tracker updates before starting the next one — see memory.
> Resolved: swapped the deprecated `@langchain/community` for `@langchain/tavily` project-wide (package.json, architecture.md, library-docs.md all updated) — user approved.
> Design decision (Phase 3): `benchmarkScraper.tool.ts` and `pricingScraper.tool.ts` return raw `RawItem[]` material, not pre-structured `BenchmarkScore[]`/`PricingEntry[]`. No verified stable public JSON API exists for the HF/LiveBench/HELM leaderboards or for provider pricing pages (researched via web search — only an unofficial third-party mirror was found for the arena leaderboard, not worth hardcoding as a project dependency). Live-tested: the pricing tool's JS-render fallback works as intended (OpenAI's pricing page returned too little text and correctly fell back to a search result). Per build-plan.md 3.3's own fallback instruction, structured extraction now happens in the Phase 4 Benchmark/Pricing agents via their cheap-tier LLM call, keeping tools as dumb fetchers and centralizing LLM usage (and the cost-tier rule) in agents. Keep this in mind when building 4.2 and 4.3 — those agents must call `getLLM("cheap").withStructuredOutput(...)` on the tool's `RawItem[]` output.
> Live-testing observation for Phase 4.1: a generic Tavily query like "latest AI model releases this week" returned a low-relevance top hit (a dictionary definition page). The WebSearch agent's actual queries will need to be more specific/targeted per source than that.
> Resolved (Phase 4.1): `webSearch.agent.ts` built. One query per source from `architecture.md` (excluding Benchmarks & Pricing groups — those belong to 4.2/4.3), each scoped with Tavily's `timeRange: "day"` + `includeDomains: [domain]` (this is the actual 24h filter — Tavily search results never carry a real `publishedAt`, so date-based filtering isn't possible after the fact). Raw hits are deduped by URL, then filtered against the last 7 days of `DigestRecord.sourceUrls` from MongoDB (per `library-docs.md`'s dedup pattern) *before* the LLM cleanup pass, to avoid spending tokens on items we'd drop anyway. A single batched `getLLM("cheap").withStructuredOutput(...)` call cleans title/source/summary and drops non-news hits (discussion pages, commit diffs, etc).
> Real bug found and fixed live: Gemini's structured-output schema converter rejects a `.nullable()` zod field (`publishedAt: z.string().nullable()`) with `400 Invalid JSON payload ... Proto field is not repeating, cannot start list`. Fixed by using `.optional()` instead (works across all three providers) and normalizing `undefined → null` in code after the LLM call. **Apply the same `.optional()` pattern, not `.nullable()`, in every future Zod schema passed to `withStructuredOutput()` in this project** — this will recur in 4.2/4.3/4.4 wherever an optional field exists.
> `getLLM(tier)` signature changed to `getLLM(tier, maxTokens)` — now required on every call, mapped per-provider (`maxOutputTokens` for Gemini, `maxTokens` for OpenAI/Anthropic) to satisfy code-standards.md's "always set maxTokens" rule. Update call sites in 4.2 onward accordingly.
> `search()` in `search.tool.ts` gained an optional second `options` param (`{ timeRange?, includeDomains? }`), passed through to Tavily's `.invoke()`. Backward compatible — existing `benchmarkScraperTool`/`pricingScraperTool` calls (`search(query)` with no options) are unaffected.
> Live-verified end to end with real MongoDB (after the user added their current IP to the Atlas Network Access list — a one-time dev-environment fix, not a code issue) + real Tavily + real Gemini: 71 raw hits across 17 source queries → 30 cleaned `RawItem[]`, 0 errors, ~22s run time.

---

Update this file as you complete each item. Mark done items with `[x]`.
Do not start a new phase until every item in the current phase is checked.

---

## Phase 1 — Project scaffold

- [x] 1.1 Init project — `package.json`, `tsconfig.json`, `.env.example`, `.env`
- [x] 1.2 Config loader — `src/config/index.ts` with Zod validation
- [x] 1.3 MongoDB connection — `src/db/connection.ts`
- [x] 1.4 Mongoose models — `digest.model.ts`, `benchmarkSnapshot.model.ts`
- [x] 1.5 Shared types — `src/types/index.ts`
- [x] 1.6 Entry point — `src/index.ts`
- [x] **Phase 1 exit check passed** — `npx tsx src/index.ts` connected to the real MongoDB Atlas cluster and logged `MongoDB connected` / `AI Digest started`

---

## Phase 2 — LangGraph state and graph scaffold

- [x] 2.1 State definition — `src/graph/state.ts` with `DigestState` annotation
- [x] 2.2 LLM factory — `getLLM(tier)` in config, cheap + premium tiers, all three providers
- [x] 2.3 Agent stubs — all six agent files created with correct signatures
- [x] 2.4 Graph definition — `src/graph/graph.ts` with all nodes and edges wired
- [x] 2.5 Supervisor node — `src/graph/supervisor.ts`
- [x] **Phase 2 exit check passed** — graph runs and logs each stub agent in correct order (verified via a temporary throwaway script, removed after)

---

## Phase 3 — Tools

- [x] 3.1 Web fetch tool — `src/tools/webFetch.tool.ts` (live-verified against a real page)
- [x] 3.2 Search tool — `src/tools/search.tool.ts` (live-verified with real `TAVILY_API_KEY`, returned 5 typed results)
- [x] 3.3 Benchmark scraper tool — `src/tools/benchmarkScraper.tool.ts` (no cheerio on JS pages; returns raw `RawItem[]` via search fallback; live-verified, returned 15 results — see note above)
- [x] 3.4 Pricing scraper tool — `src/tools/pricingScraper.tool.ts` (tries direct fetch, falls back to search; returns raw `RawItem[]`; live-verified, returned 7 results, fallback path confirmed working — see note above)
- [x] **Phase 3 exit check passed** — all four tools live-tested and returned correctly typed data

---

## Phase 4 — Agents

- [x] 4.1 WebSearch agent — fetches, filters last 24h, dedupes vs last 7 days (live-verified: 71→30 items, 0 errors)
- [ ] 4.2 Benchmark agent — scrapes, diffs against last snapshot, saves new snapshot
- [ ] 4.3 Pricing agent — scrapes prices, diffs against last snapshot, saves new snapshot
- [ ] 4.4 Synthesis agent — groups items, writes narrative, attaches source URLs
- [ ] 4.5 Personalization agent — reorders, adds "Why this matters", flags priority
- [ ] 4.6 EmailFormatter agent — validates content, renders HTML, returns `EmailPayload`
- [ ] **Phase 4 exit check passed** — full graph produces valid `EmailPayload` with source URLs

---

## Phase 5 — Email delivery and persistence

- [ ] 5.1 HTML email template — `src/email/template.ts` (inline styles, Gmail-safe)
- [ ] 5.2 Resend sender — `src/email/sender.ts`
- [ ] 5.3 Persistence — `DigestRecord` saved to MongoDB after successful send
- [ ] 5.4 Failure alert — `sendFailureAlert()` sends a one-line email on fatal error
- [ ] **Phase 5 exit check passed** — real email received + MongoDB record saved + failure alert works

---

## Phase 6 — Scheduler and deployment

- [ ] 6.1 Cron scheduler — `src/scheduler/cron.ts`, `0 7 * * 1-5`, Europe/Rome timezone
- [ ] 6.2 Railway deployment — env vars set, service live, first scheduled run successful
- [ ] **Phase 6 exit check passed** — service runs on Railway and delivers email on schedule

---

## Final acceptance checklist

Run through this after Phase 6 is complete.

- [ ] Email arrives between 7:00–7:15am on a weekday
- [ ] Email contains at least 3 distinct content categories
- [ ] Every item in the email has a working source URL
- [ ] Benchmark section shows deltas vs previous run
- [ ] At least one item has a "Why this matters for you" note
- [ ] No duplicate items from yesterday's email
- [ ] Run completes without unhandled errors in Railway logs
- [ ] DigestRecord saved to MongoDB for every successful run
