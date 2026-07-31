// Local dev entry: runs one digest immediately via run.ts's side effect, without
// waiting for Railway's cron. Not used in production — Railway runs src/run.ts
// directly (see package.json "start").
import "./run.js";
