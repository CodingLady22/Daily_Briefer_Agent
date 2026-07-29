# Memory — AI Digest Build (Phase 4.5 Personalization agent)

Last updated: 2026-07-29

## What was built

- **Phase 4.5 — Personalization agent:** `src/agents/personalization.agent.ts` (implemented, replacing the stub) + `src/agents/personalization.prompt.ts` (new). Reorders `DigestSection[]` from Synthesis based on the user's TypeScript/LangGraph/RAG/observability/guardrails/career-transition stack, flags every item `priority: true`/`false`, and adds a `whyThisMatters` note to exactly the top 3 items. Returns `PersonalisedDigest` on state.
- `src/agents/synthesis.agent.ts`: one-line change — its local `CATEGORIES` const is now `export const CATEGORIES`, so Personalization imports the same category list instead of duplicating it.
- Dev script `src/_test-personalization.ts` added (gitignored, `src/_test-*.ts` pattern) — chains WebSearch/Benchmark/Pricing → Synthesis → Personalization with real upstream data.
- `context/progress-tracker.md` updated: 4.5 checked off, detailed session log entry added.

## Decisions made

- Personalization's LLM call is deliberately narrower than Synthesis's: it receives only `{category, items: [{title, url, summary, source}]}` and returns just an ordering + `{url, priority, whyThisMatters?}` annotation per item — it never re-emits title/summary/source, so content can't drift from what Synthesis already cited.
- `narrative` and `comparisonTable` are copied through untouched from the original `DigestSection` — Personalization never regenerates or reorders a comparisonTable's rows (they're a separate structured summary from Synthesis, not positionally tied to the item list).
- Matching the LLM's output back to original data is done by `url` (items) and `category` (sections) lookup. Any section or item the LLM's structured output omits is appended back in, undecorated (`priority: false`, no note) — every item/section from the input is guaranteed to survive even if the LLM under-covers.
- The "top 3 items get a whyThisMatters note" rule (build-plan 4.5) is enforced by instructing the LLM to apply it to the first 3 items of *its own* chosen final order — not by having the code guess which 3 the LLM meant.
- `whyThisMatters` on the item-annotation Zod schema uses `.optional()`, not `.nullable()` — same Gemini structured-output constraint hit on every prior agent in this project (WebSearch, Benchmark, Synthesis). Normalized to `null` in code.

## Problems solved

- None new this session — 4.5 followed the established patterns (optional-not-nullable Zod fields, `errors: [message]` catch blocks, dev test scripts chaining upstream agents) without hitting a new bug.

## Current state

- Phases 1, 2, 3 fully complete; Phase 4.1–4.5 complete, all live-verified with real credentials (MongoDB, Tavily, Gemini, Resend).
- Live test result for 4.5: 27 rawItems → 6 Synthesis sections → 26 total items, 11 flagged priority, exactly 3 with a `whyThisMatters` note, 0 errors, ~2.6s run time. Section order came back stack-relevant-first (Framework & tooling news, Model releases ahead of Research papers/Reliability incidents). `npx tsc --noEmit` clean.
- Non-blocking observation (not a 4.5 bug): one live run's "Benchmark movements" section had a duplicate `DeepSeek v3 HELM` item (same url/summary) — this originates in Synthesis's own output, same class of LLM extraction non-determinism already logged for Phase 4.3. Not fixed, not in scope for 4.5.
- Only 4.6 (EmailFormatter) stands between here and the Phase 4 exit check.

## Next session starts with

**Phase 4.6 — EmailFormatter agent** (`src/agents/emailFormatter.agent.ts`). Re-read the EmailFormatter sections of `build-plan.md` (4.6) and `email-design.md` first (the email is the entire UI — inline styles only, table-based layout, `EMAIL_TOKENS` constants, bullets for items/tables for comparisons). Carry forward:
- Must validate: at least 1 section with at least 1 item — throw if not (architecture.md rule 4: never send an email with zero items).
- Renders HTML via `src/email/template.ts` — that file doesn't exist yet; build-plan 4.6 depends on 5.1's template, so check whether 4.6 needs a minimal inline renderer first or whether to pull 5.1 forward. Decide this with the user before writing code, since build-plan.md's phase order has 5.1 in Phase 5, not Phase 4.
- Returns `EmailPayload` (`{subject, html}`) added to state.
- This is the last Phase 4 item — completing it triggers the Phase 4 exit check (full graph produces a valid `EmailPayload` with source URLs).
- Build only this one checklist item, then stop for manual testing per the standing workflow.

## Open questions

- Whether `src/email/template.ts` (build-plan Phase 5.1) needs to be built now, ahead of schedule, so EmailFormatter (Phase 4.6) has something to call — or whether 4.6 should ship a minimal placeholder HTML renderer and defer the real Gmail-safe template to Phase 5.1 as originally planned. Ask the user before starting 4.6.
