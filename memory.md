# Memory — AI Digest: Phase 6 verified in production, project complete

Last updated: 2026-11-08

## What was built

- **Railway deployment is live and verified.** Cron `0 5 * * 1-5` (UTC) set in Railway's dashboard (not in code) triggers `npm start` → `tsx src/run.ts` (one-shot: connect → run graph → send → persist → disconnect → exit).
- **Production confirmation:** digest email arrived 7:00–7:05am local on a weekday; container started, ran, and stopped cleanly (deploy logs); 0 non-fatal errors; `DigestRecord` saved to MongoDB (digest id in logs).
- **Email content checks passed:** 3+ categories, every item has a working source URL, benchmark section shows deltas vs previous run, at least one "why this matters" note, no duplicates from a prior day.
- **`context/progress-tracker.md` updated:** 6.2 and the Phase 6 exit check checked off; all 8 Final Acceptance items checked off; Current Status header now "Phase 6 complete — app deployed and running on Railway cron."; "Next" line changed to "None — all phases complete."

## Decisions made

- One-shot script + Railway native cron (not node-cron) so the container isn't billed 24/7. Fixed UTC cron with accepted ~1h seasonal DST drift for Rome. `CRON_TIMEZONE` in config is documentation only.
- Both success and failure paths in `run.ts` must disconnect Mongoose before `process.exit()` — an open connection would keep the container alive.

## Problems solved

- Replaced node-cron with Railway cron (commit `3a7e11d`); removed redundant run-start log from `run.ts` (commit `c7555f4`); README added (PR #13).

## Current state

All six phases and the Final Acceptance Checklist are complete. Only change since the last commit is the `progress-tracker.md` edit (uncommitted) plus this file.

## Next session starts with

Commit/PR the tracker update if not already done. Otherwise optional maintenance only: revisit `LLM_MODEL_PREMIUM` if a Pro-tier model becomes available; "Last completed" paragraph and the 6.1 note in the tracker's header still describe the old node-cron scheduler and could be pruned.

## Open questions

- Whether to prune stale historical notes in `progress-tracker.md`.
- Accepted residual: LLM model-name variance can occasionally miss a cross-day diff match (v2 idea: alias map).
