# Memory — AI Digest: Railway one-shot cron migration

Last updated: 2026-07-31

## What was built

- **`src/run.ts` (new)** — the one-shot production entry point. `connectDB()` → invoke `digestGraph` once → `sendDigest()` → `saveDigestRecord()` → `mongoose.disconnect()` → `process.exit(0)`. On any fatal error (including a `connectDB()` failure): `sendFailureAlert(reason)` → disconnect only if a connection was actually opened → `process.exit(1)`.
- **`src/index.ts` (rewritten)** — reduced to a single line, `import "./run.js"`. Local-dev-only alias that triggers an immediate run with no scheduling. Railway never executes this file.
- **Deleted `src/scheduler/cron.ts`** and the now-empty `src/scheduler/` directory (the old always-on `node-cron` scheduler).
- **`package.json`** — `"start": "tsx src/run.ts"`, `"dev": "tsx src/index.ts"`; removed `node-cron`/`@types/node-cron`; moved `tsx` from `devDependencies` to `dependencies` (needed in the Railway production build since `npm start` now shells out to it directly). Ran `npm install` to sync `package-lock.json`.
- **`src/config/index.ts`** — `CRON_TIMEZONE` kept in the schema/config object but now commented as documentation-only; no code path reads it for scheduling anymore.
- **`.env.example`** — comment added on `CRON_TIMEZONE` clarifying the schedule now lives in Railway's dashboard, in UTC.
- **Context files updated to match:** `context/architecture.md` (folder structure, data-flow diagram trigger line, new "Deployment & scheduling" section documenting the UTC/DST decision, `node-cron` removed from approved packages), `context/build-plan.md` (Phase 6 fully rewritten around the one-shot model, dropped the Procfile/railway.toml step since Nixpacks auto-runs `npm start`), `context/library-docs.md` (node-cron section replaced with a "Railway cron (scheduling)" section), `context/progress-tracker.md` (6.1 rewritten and checked off, 6.2 reworded, detailed changeover note logged), `context/project-overview.md` (Step 1 trigger description and the in-scope bullet, both previously described node-cron/local time).

## Decisions made

- **One-shot over always-on, per explicit user direction:** node-cron kept the Node process (and Railway container) alive 24/7 for a job that fires once a day — billed continuously for no benefit. Railway's native cron starts a fresh container per trigger, runs `npm start` to completion, and stops it, so the app had to become a script that always terminates on its own.
- **Timezone: fixed UTC cron expression, seasonal drift accepted, not auto-adjusted for DST.** Railway cron runs in UTC; Rome is UTC+1/UTC+2 depending on DST, so "7am Rome" maps to a different UTC hour part of the year. Chose a fixed UTC expression over DST-aware logic — simpler, and a ~1-hour seasonal drift is an acceptable tradeoff for a digest email. If tighter accuracy is ever wanted, the expression must be hand-adjusted in Railway's dashboard at each DST changeover — documented in `architecture.md`.
- **`src/index.ts` survives as a local-dev alias rather than being deleted outright** — importing `run.ts` (not re-implementing its logic) avoids any risk of the run logic diverging between a "dev" and "prod" path, and avoids a double-execution bug (index.ts never calls `run()` again itself — it only imports for the side effect).
- **`CRON_TIMEZONE` env var kept, not removed** — has no code effect anymore, but stays as human documentation of the local time the fixed UTC expression was chosen to approximate.

## Problems solved

- No bugs surfaced. Both the success path and the forced-failure path worked on the first live run (see verification below) — no debugging needed this session.

## Current state

- `npx tsc --noEmit` clean.
- **Live-verified end to end, twice, with real services (no mocks):**
  1. Success path: `npm start` connected to real MongoDB, ran a full digest (5 sections, 19 items, 0 non-fatal errors), sent a real email via Resend, and the process exited on its own with code 0 — no hang.
  2. Failure path: temporarily pointed `MONGODB_URI` at an unreachable host (`.env` backed up first, restored after), ran `npm start` again — it caught the fatal error, sent a real failure-alert email via Resend, and exited with code 1. `.env` confirmed restored to the real MongoDB URI afterward.
- `npm install` confirmed `node-cron` and `@types/node-cron` are gone from the dependency tree.
- Branch `deployment`. Everything above is implemented and locally verified; **not yet done** is the Railway dashboard side of 6.2 (setting env vars, confirming `npm start` is the run command, setting the cron expression in UTC in Railway's service settings) — that's a console action, not a code change, and wasn't part of this session's scope.
- Nothing committed yet this session — user has not asked for a commit.

## Next session starts with

**Phase 6.2 — Railway deployment (dashboard side).** Set/confirm env vars in the Railway service dashboard, confirm Railway (Nixpacks) is running `npm start`, set the cron expression in the service's cron settings using a fixed UTC time approximating 7am Europe/Rome (see `architecture.md` → "Deployment & scheduling" for the exact decision), deploy, and verify via Railway's deployment logs that a triggered run shows start → digest run → email sent → **container stop** (not staying alive). That log-verified stop is the actual Phase 6 exit check — do not consider Phase 6 done from a local run alone.

## Open questions

- None currently open.

---

## PR summary — Railway one-shot cron migration

**What this PR does:** Replaces the always-on `node-cron` scheduler with a one-shot script designed to run under Railway's native cron. Railway starts a fresh container per scheduled trigger, runs the script to completion, and stops the container — so continuing to hold a Node process alive 24/7 (the old model) meant paying for idle RAM the other 23+ hours a day. The app is now a script that always exits cleanly on its own, on both success and failure.

**Major changes:**
- Added `src/run.ts`, the new production entry point: connects to MongoDB, runs the LangGraph digest pipeline once, sends the email, persists the `DigestRecord`, closes the Mongoose connection, and exits with code 0. Any fatal error (including a DB connection failure) is caught, triggers a real failure-alert email, closes the connection if one was opened, and exits with code 1. The explicit `mongoose.disconnect()` before every exit is the critical piece — an open connection would otherwise keep the process (and the Railway bill) running indefinitely.
- Reduced `src/index.ts` to a one-line local-dev alias (`import "./run.js"`) for testing a run on demand without waiting on Railway's cron; it is never what Railway executes in production.
- Deleted the old `src/scheduler/cron.ts` and removed `node-cron`/`@types/node-cron` from `package.json`.
- Updated `package.json` scripts (`start` → `tsx src/run.ts`, `dev` → `tsx src/index.ts`) and moved `tsx` into `dependencies` so it's available in Railway's production build.
- Documented the scheduling model change across `architecture.md`, `build-plan.md`, `library-docs.md`, `progress-tracker.md`, and `project-overview.md`, including a specific, explicit decision on the UTC/DST timezone tradeoff (fixed UTC expression, accepted seasonal drift, no auto-DST-adjustment).
- Live-verified both the success and forced-failure paths against real MongoDB and Resend — see "Current state" above for specifics.

**Files changed (`src/` only):**
- `src/run.ts` (new)
- `src/index.ts` (rewritten — now a one-line local-dev alias)
- `src/config/index.ts` (comment update only — `CRON_TIMEZONE` marked documentation-only)
- `src/scheduler/cron.ts` (deleted)

**Other files changed (outside `src/`, for reference):** `package.json`, `package-lock.json`, `.env.example`, `context/architecture.md`, `context/build-plan.md`, `context/library-docs.md`, `context/progress-tracker.md`, `context/project-overview.md`.
