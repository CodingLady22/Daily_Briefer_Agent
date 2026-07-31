# Memory — AI Digest Build (Phase 5 exit check + Phase 6.1 Cron scheduler)

Last updated: 2026-07-31

## What was built

- **Phase 5 exit check:** Live-verified both halves in one session. Success path via existing `src/_test-persistence.ts` — full graph → real Resend send → real `DigestRecord` saved and re-read from MongoDB (16 items, 14 source URLs, 0 errors). Failure path via a new throwaway `src/_test-failurePath.ts` (written, run, then deleted) — forced a real fatal DB connection error inside a try/catch mirroring the Phase 6.1 cron wrapper, confirmed `sendFailureAlert()` fired for real. User confirmed the digest email actually landed in their inbox.
- **Phase 6.1 — Cron scheduler:** Created `src/scheduler/cron.ts`. Exports `startScheduler()`, which schedules `runDigest()` on `"0 7 * * 1-5"` in `config.cronTimezone` (Europe/Rome). `runDigest()` runs the full sequence: invoke `digestGraph`, throw if `emailPayload`/`personalisedDigest` is missing, `sendDigest()`, then `saveDigestRecord()`. The scheduled callback wraps `runDigest()` in try/catch — any fatal error is caught, logged, and routed to `sendFailureAlert(reason)`, never left to crash the process.
- Wired into `src/index.ts`: `connectDB()` → `startScheduler()` → log `"AI Digest started"`.
- `context/progress-tracker.md` updated: Phase 5 exit check and 6.1 both checked off, status/next-step lines updated, verification notes added for both.

## Decisions made

- `runDigest()` deliberately extends beyond what `library-docs.md`'s illustrative cron snippet shows (that snippet only calls `digestGraph.invoke({})`) — it also calls `sendDigest()` and `saveDigestRecord()`, matching the real sequence already proven in `_test-persistence.ts`. The scheduler is the permanent home for that sequence going forward; `_test-persistence.ts` remains a reusable dev script per existing precedent.
- Forced-error verification used a real `mongoose.connect()` against an unreachable host (not a contrived `throw`) so the test exercises an actual fatal-error class the wrapper needs to catch.

## Problems solved

- N/A — no bugs surfaced this session. Both pieces of work matched existing proven patterns (`_test-persistence.ts` for the success path, `library-docs.md`'s cron try/catch shape for the failure path) and worked on the first live run.

## Current state

- Phases 1–5 fully complete, including the Phase 5 exit check. Phase 6 in progress: 6.1 (cron scheduler) done and live-verified (process starts, connects to MongoDB, registers the schedule, stays alive with no errors — confirms registration only, not an actual 7am fire, which isn't testable on-demand without changing the cron expression). 6.2 (Railway deployment) not started.
- `npx tsc --noEmit` clean.
- Branch `cronScheduler` (cut fresh from `main` at session start, no prior divergence). Currently uncommitted: `src/index.ts` (modified), `src/scheduler/cron.ts` (new), `context/progress-tracker.md` (modified). No commit made — user has not asked for one.

## Next session starts with

**Phase 6.2 — Railway deployment.** Per `build-plan.md`: add a `Procfile` or `railway.toml` with start command `npx tsx src/index.ts`, confirm all env vars are set in the Railway dashboard, deploy, and verify the first scheduled run completes successfully. That's also the Phase 6 exit check ("service runs on Railway, survives a restart, delivers the email on schedule without manual intervention") — do not consider Phase 6 done until a real scheduled run succeeds on Railway, not just a local start.

## Open questions

- None currently open.

---

## PR summary — Phase 5 exit check + 6.1 (cronScheduler branch)

**What this PR does:** Closes out Phase 5 with a full live exit-check verification (real email, real MongoDB record, and real failure-alert firing all confirmed working together), then builds Phase 6.1 — the cron scheduler that turns the whole pipeline into an actual scheduled daily job instead of a manually-run script.

**Major changes:**
- Verified the Phase 5 exit check live: a full graph run's email + MongoDB persistence, and a separately forced fatal error correctly triggering `sendFailureAlert()` — no code changes required for this part, purely verification (throwaway test scripts written and removed, per existing project precedent).
- Added `src/scheduler/cron.ts` — `startScheduler()` schedules the digest run for `0 7 * * 1-5` (Mon–Fri, `config.cronTimezone`). On each fire: invokes the LangGraph pipeline, sends the resulting email via Resend, and persists a `DigestRecord` to MongoDB. Any fatal error along the way is caught and reported via a failure-alert email rather than crashing the process.
- Updated `src/index.ts` to start the scheduler on boot, right after the MongoDB connection is established.
- Live-verified: running the entry point connects to MongoDB, registers the cron schedule with the correct expression and timezone, and stays running with no errors.

**Files changed (src/ only):**
- `src/index.ts`
- `src/scheduler/cron.ts` (new)

(`context/progress-tracker.md` also changed, outside `src/`, to check off the Phase 5 exit check and 6.1, and log both verification notes.)
