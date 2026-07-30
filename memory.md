# Memory — AI Digest Build (Phase 5.3 Persistence)

Last updated: 2026-07-30

## What was built

- **Phase 5.3 — Persistence:** `src/db/digest.model.ts` extended with `saveDigestRecord()` — builds and writes a `DigestRecord` from a completed run. Computes `sourceUrls` (deduped via `Set` across every item's `url`) and `itemCount` (total items across sections); caller passes `runDate`, `emailPayload`, `sections`, `runDurationMs`, `runErrors`.
- `DigestRecordDocument`'s `sections` field retyped from `DigestSection[]` to `PersonalisedSection[]`.
- `context/architecture.md`'s `DigestRecord` schema doc updated to match (`sections: PersonalisedSection[]`, with a comment noting it's the final emailed content).
- `context/progress-tracker.md` updated: 5.3 checked off, status/next-step lines updated, a detailed note added documenting the implementation, the design decision, and live-verification results.
- `src/_test-persistence.ts` added (gitignored, `src/_test-*.ts` pattern) — kept, not removed, matching the `_test-emailFormatter.ts`/`_test-emailPreview.ts` precedent of keeping reusable pipeline scripts. Runs the full graph, sends a real email, saves the record, then re-queries it to confirm the round-trip.

## Decisions made

- **`saveDigestRecord()` takes plain typed input, not `DigestStateType`.** Keeps `src/db/` decoupled from the LangGraph state shape — nothing else in `db/` imports from `graph/`, and this preserves that layering even though it means the caller must destructure state itself.
- **`DigestRecord.sections` stores `PersonalisedSection[]`, not the pre-personalization `DigestSection[]`.** The record's job is to capture what was actually emailed (Personalization is the last content-shaping step before EmailFormatter), so priority flags and "why this matters" notes are preserved in history. This is a deviation from architecture.md's original schema type — flagged and the doc updated to match, per the project's established pattern (same as the Phase 4.3 `PricingDelta.significant` addition).
- Mongoose's own schema field stays the loose `{ type: Array, default: [] }` — no schema change needed, only the TS type.

## Problems solved

- N/A this session — no bugs surfaced. Clean build against a well-scoped new function; type-checked clean on first pass.

## Current state

- Phases 1–4 complete. Phase 5.1, 5.2, and 5.3 complete and live-verified.
- Live-verified 5.3 end to end via `_test-persistence.ts`: full graph run (20939ms, `errors: []`) → real Resend send (real message id returned) → `saveDigestRecord()` → re-read the saved doc, confirmed `itemCount: 20`, `sourceUrlCount: 20` (all unique), `runDurationMs: 20939`, `runErrors: []`. `npx tsc --noEmit` clean.
- Remaining Phase 5 item open: 5.4 (failure alert — extend `src/email/sender.ts` with `sendFailureAlert()`, called by the scheduler when a run throws a fatal error).
- Branch `persistence`: three tracked file changes vs `main` — `src/db/digest.model.ts`, `context/architecture.md`, `context/progress-tracker.md`. (`src/_test-persistence.ts` is gitignored and not part of any PR diff.) Nothing committed yet — user has not asked for a commit.

## Next session starts with

**Phase 5.4 — Failure alert.** Add `sendFailureAlert(reason: string): Promise<void>` to `src/email/sender.ts` per `library-docs.md`'s Resend pattern — plain one-line email ("AI Digest run failed: [reason]"), never dressed up. Per the stop-after-each-feature workflow, build 5.4 alone, live-test by forcing a real failure path, then stop for tracker update. After 5.4, the Phase 5 exit check itself (real email + MongoDB record + failure alert, all working together) still needs to be run and checked off.

## Open questions

- None currently open.

---

## PR summary — Phase 5.3 (persistence branch)

**What this PR does:** Persists every successfully sent digest to MongoDB as a `DigestRecord`, closing the loop on Phase 5's email-delivery-and-persistence goal. After a run completes and the email sends, the final personalised content, source URLs, item count, run duration, and any non-fatal errors are saved for history and future 7-day dedup lookups.

**Major changes:**
- Added `saveDigestRecord()` to `src/db/digest.model.ts` — computes deduped `sourceUrls` and `itemCount` from the run's final sections and writes the `DigestRecord`.
- Changed `DigestRecord.sections` (and `DigestRecordDocument`'s TS type) from `DigestSection[]` to `PersonalisedSection[]` — the record now stores the final personalised content (with `priority`/`whyThisMatters`) actually emailed, not the pre-personalization draft. `architecture.md` updated to match.
- Live-verified end to end: full pipeline → real email send → save → re-read, confirmed correct `itemCount`, `sourceUrls`, `runDurationMs`, `runErrors`.

**Files changed (src/ only):**
- `src/db/digest.model.ts`

(`context/architecture.md` and `context/progress-tracker.md` also changed, outside `src/`. `src/_test-persistence.ts` is a gitignored dev script, not part of this PR's diff.)
