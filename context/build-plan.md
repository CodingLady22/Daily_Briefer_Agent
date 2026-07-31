# Build Plan — AI Digest

## Core Principle

Every phase ends with something you can run and verify — a log line, a typed tool output, a real email in the inbox. No invisible phases. If a feature can't be tested immediately after it's built, it is incomplete. Since this app has no UI, the "visual check" is the rendered email: after Phase 5, every change to digest content must be verified by triggering a real send and reading it.

Build in strict phase order. Do not start a phase until all items in the previous phase are checked off in `progress-tracker.md`.

---

## Phase 1 — Project scaffold

Goal: a running Node.js + TypeScript project with DB connection and environment config.

### 1.1 — Init project
- Create `package.json` with all approved packages from `architecture.md`
- Create `tsconfig.json` with strict mode, `moduleResolution: bundler`, `module: ESNext`
- Create `.env.example` with all required keys (no values)
- Create `.env` (gitignored)

Required `.env` keys:
```
MONGODB_URI=
LLM_PROVIDER=            # "gemini" | "openai" | "anthropic"
LLM_MODEL_CHEAP=        # cheap model for extraction, e.g. gemini-1.5-flash
LLM_MODEL_PREMIUM=      # premium model for reasoning, e.g. gemini-1.5-pro
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
TAVILY_API_KEY=         # used by the search tool
RESEND_API_KEY=
RESEND_FROM=
DIGEST_TO_EMAIL=
CRON_TIMEZONE=Europe/Rome
```

### 1.2 — Config loader
File: `src/config/index.ts`
- Load `.env` with dotenv
- Validate all required keys are present using Zod
- Export a typed `config` object — no other file reads `process.env` directly

### 1.3 — MongoDB connection
File: `src/db/connection.ts`
- Connect using Mongoose with the URI from config
- Export a `connectDB()` function
- Log connection success or throw on failure

### 1.4 — Mongoose models
Files: `src/db/digest.model.ts`, `src/db/benchmarkSnapshot.model.ts`
- Implement schemas exactly as defined in `architecture.md`
- Export typed Mongoose models

### 1.5 — Shared types
File: `src/types/index.ts`
- Define and export all shared types:
  - `RawItem` — a single scraped item (title, url, source, summary, publishedAt)
  - `BenchmarkDelta` — a model's score change on a benchmark
  - `PricingDelta` — a model's price change (modelName, provider, oldPrice, newPrice, source)
  - `DigestSection` — a named category with an array of items, a narrative, and an optional `comparisonTable: { headers: string[], rows: string[][] } | null`
  - `PersonalisedDigest` — ordered sections with priority flags and "why this matters" notes
  - `EmailPayload` — subject line and HTML string

### 1.6 — Entry point
File: `src/index.ts`
- Call `connectDB()`
- Start the cron scheduler
- Log startup confirmation

**Phase 1 exit check:** Running `npx tsx src/index.ts` connects to MongoDB and logs startup without errors.

---

## Phase 2 — LangGraph state and graph scaffold

Goal: a runnable LangGraph graph with empty agent nodes.

### 2.1 — State definition
File: `src/graph/state.ts`
- Define `DigestState` using LangGraph `Annotation.Root`
- Fields:
  - `rawItems: RawItem[]`
  - `benchmarkDeltas: BenchmarkDelta[]`
  - `pricingDeltas: PricingDelta[]`
  - `sections: DigestSection[]`
  - `personalisedDigest: PersonalisedDigest | null`
  - `emailPayload: EmailPayload | null`
  - `errors: string[]`
  - `runDate: string`

### 2.2 — LLM factory
File: `src/config/index.ts` (extend)
- Export a `getLLM(tier: "cheap" | "premium")` function
- Picks the provider from `LLM_PROVIDER` and the model name from `LLM_MODEL_CHEAP` or `LLM_MODEL_PREMIUM` based on the tier
- Supports: `ChatGoogleGenerativeAI`, `ChatOpenAI`, `ChatAnthropic`
- WebSearch + Benchmark call `getLLM("cheap")`. Synthesis + Personalization call `getLLM("premium")`.

### 2.3 — Agent stubs
Create stub files for all six agents. Each exports a function that takes `DigestState` and returns a `Partial<DigestState>`. Stubs return empty arrays / null for now.
- `src/agents/webSearch.agent.ts`
- `src/agents/benchmark.agent.ts`
- `src/agents/pricing.agent.ts`
- `src/agents/synthesis.agent.ts`
- `src/agents/personalization.agent.ts`
- `src/agents/emailFormatter.agent.ts`

### 2.4 — Graph definition
File: `src/graph/graph.ts`
- Build a `StateGraph` using `DigestState`
- Add all six agent nodes
- Wire edges: supervisor → webSearch + benchmark + pricing (parallel) → synthesis → personalization → emailFormatter → END
- Compile and export the graph

### 2.5 — Supervisor
File: `src/graph/supervisor.ts`
- The supervisor node logs the run start, sets `runDate`, and routes to the first agents
- Keep it simple — no complex routing logic needed in this app

**Phase 2 exit check:** Invoking the compiled graph runs without errors and logs each stub agent being called in the correct order.

---

## Phase 3 — Tools

Goal: reusable tools the agents will call for fetching and scraping.

### 3.1 — Web fetch tool
File: `src/tools/webFetch.tool.ts`
- Takes a URL, fetches with axios, returns plain text using cheerio to strip HTML tags
- Respects a configurable timeout (10s default)
- Returns `null` on failure (never throws)

### 3.2 — Search tool
File: `src/tools/search.tool.ts`
- Wraps a LangChain `TavilySearchResults` tool or a direct Google Search API call
- Takes a query string, returns `RawItem[]`
- Each result must include title, url, snippet, and date if available

### 3.3 — Benchmark scraper tool
File: `src/tools/benchmarkScraper.tool.ts`
- **Do not scrape leaderboard HTML with cheerio.** Pages like the HuggingFace leaderboard and LiveBench render scores with JavaScript — a plain fetch returns an empty shell.
- Instead, in this order of preference:
  1. Use a JSON/API endpoint if the source exposes one (e.g. HuggingFace datasets API).
  2. If none, use the search tool to find recent benchmark results as `RawItem[]` and let the Benchmark agent read scores from the text.
- **Run the three leaderboard queries with `Promise.allSettled`, not `Promise.all`.** If one query fails, keep the results from the others and record the failed query. One rate-limited source must never zero out the whole run.
- Returns raw score array `{ modelName, benchmark, score, source }[]` — delta calculation happens in the Benchmark agent.

### 3.4 — Pricing scraper tool
File: `src/tools/pricingScraper.tool.ts`
- Fetches provider pricing pages listed in `architecture.md`
- Parses into `{ modelName, provider, inputPer1M, outputPer1M, source }[]`
- Same fallback rule as 3.3: if a page is JS-rendered, use the search tool instead.
- **Use `Promise.allSettled` across the pricing pages**, never `Promise.all` — keep partial results, log failed pages.
- Returns raw price array — delta calculation happens in the Pricing agent.

**Phase 3 exit check:** All four tools can be called in isolation (small test script) and return correctly typed data.

---

## Phase 4 — Agents (implement one at a time)

Implement agents in this order. Each agent must be fully working before moving to the next.

### 4.1 — WebSearch agent
File: `src/agents/webSearch.agent.ts`

Behaviour:
- Runs search queries across all sources listed in `architecture.md`
- Filters results to last 24 hours only
- Deduplicates against the last 7 days of digest URLs (read from MongoDB) — a story can resurface mid-week
- Returns `RawItem[]` added to state as `rawItems`

Prompt guidance: instruct the LLM to extract clean title, url, one-sentence summary, and source name from each raw result.

### 4.2 — Benchmark agent
File: `src/agents/benchmark.agent.ts`

Behaviour:
- Calls the benchmark scraper tool
- **Dedupes scores by `modelName::benchmark`** before diffing — cross-citing sources produce the same pair twice
- Reads the most recent `BenchmarkSnapshot` from MongoDB
- Calculates deltas: `currentScore - previousScore` per model per benchmark
- Flags deltas > 2 points as significant
- **Guard before saving:** only save the new snapshot if it has ≥ 5 scores. If fewer, skip the save, keep the old baseline, and log a low-yield error. Never overwrite history with a bad scrape.
- Returns `BenchmarkDelta[]` added to state as `benchmarkDeltas`

### 4.3 — Pricing agent
File: `src/agents/pricing.agent.ts`

Behaviour:
- Calls the pricing scraper tool
- **Dedupes prices by `modelName::provider`** before diffing
- Reads the most recent `PricingSnapshot` from MongoDB
- Calculates deltas: `currentPrice - previousPrice` per model
- Flags any change (price moves are rare and always worth noting)
- **Guard before saving:** only save the new snapshot if it has ≥ 5 prices. If fewer, skip the save, keep the old baseline, and log a low-yield error.
- Returns `PricingDelta[]` added to state as `pricingDeltas`

### 4.4 — Synthesis agent
File: `src/agents/synthesis.agent.ts`

Behaviour:
- Receives `rawItems`, `benchmarkDeltas`, and `pricingDeltas` from state
- Groups items into the six categories defined in `project-overview.md`
- For each category, writes a 2–4 sentence narrative
- **When 2+ models or frameworks appear in the same category, output a structured comparison table** — `comparisonTable: { headers: string[], rows: string[][] } | null` on the section. Example: models as rows; columns for benchmark score, price per 1M tokens, context window, source. The EmailFormatter renders this as an HTML table.
- Item summaries are written as short bullet-friendly sentences (one idea each), not paragraphs
- Every item in the output must carry its source URL
- Returns `DigestSection[]` added to state as `sections`

### 4.5 — Personalization agent
File: `src/agents/personalization.agent.ts`

Behaviour:
- Receives `sections` from state
- Reorders sections: TypeScript-relevant and LangGraph-relevant items surface first
- Deprioritises Python-only content (still includes it, just lower)
- Adds a "Why this matters for you" note (1 sentence) to the top 3 items
- Marks each item as `priority: true` or `priority: false`
- Returns `PersonalisedDigest` added to state

Personalisation context to bake into the system prompt:
- Building agents with LangGraph (JS/TS)
- RAG pipelines and WhatsApp-first interfaces
- Interested in observability: LangSmith, Weave, Phoenix
- Interested in guardrails: Guardrails AI, NeMo
- Transitioning to applied AI engineering — flag anything relevant to this career move

### 4.6 — EmailFormatter agent
File: `src/agents/emailFormatter.agent.ts`

Behaviour:
- Receives `personalisedDigest` from state
- Validates: must have at least 1 section with at least 1 item — throw if not
- Renders the rich HTML email using the template in `src/email/template.ts`
- Returns `EmailPayload` (subject + HTML) added to state

Email structure:
1. Header — date, tagline
2. Priority items (highlighted)
3. One section per category — heading, narrative, item list with source links
4. Footer — unsubscribe note, run timestamp

**Phase 4 exit check:** Invoking the full graph produces a valid `EmailPayload` with HTML content and at least one source URL.

---

## Phase 5 — Email delivery and persistence

### 5.1 — HTML email template
File: `src/email/template.ts`
- Pure function: `renderEmail(digest: PersonalisedDigest, runDate: string): string`
- Returns a complete HTML string
- Follow `email-design.md` exactly for colors, layout, and content formatting rules
- Content style: **bullet points for items, HTML tables for comparisons** — never long paragraphs
- Must render correctly in Gmail (inline styles only, no external CSS, table-based layout)

### 5.2 — Resend sender
File: `src/email/sender.ts`
- `sendDigest(payload: EmailPayload): Promise<void>`
- Uses Resend SDK
- Reads `RESEND_FROM` and `DIGEST_TO_EMAIL` from config
- Logs success with Resend message ID
- Throws on failure (caller handles)

### 5.3 — Persistence after send
After the graph completes and the email is sent:
- Save a `DigestRecord` to MongoDB
- Include all source URLs, item count, run duration, and any non-fatal errors from state

### 5.4 — Failure alert
File: `src/email/sender.ts` (extend)
- `sendFailureAlert(reason: string): Promise<void>`
- Sends a plain one-line email: "AI Digest run failed: [reason]"
- Called by the scheduler when a run throws a fatal error — so a silent failure never goes unnoticed for days

**Phase 5 exit check:** A full end-to-end run sends a real email and saves a record to MongoDB. Forcing an error triggers a failure alert email.

---

## Phase 6 — One-shot run and deployment

Railway's native cron starts a container, runs the app once, and stops the
container when the process exits — so the app must be a script that completes
and exits cleanly, not a long-running scheduler. This replaces the earlier
node-cron-based plan.

### 6.1 — One-shot run entry
File: `src/run.ts`
- `connectDB()`
- Invoke the compiled `digestGraph` once
- On success: log a run summary, close the Mongoose connection
  (`mongoose.disconnect()`), then `process.exit(0)`
- On a fatal error: call `sendFailureAlert(reason)`, close the connection if one
  was opened, then `process.exit(1)`
- **Critical:** the process must always exit on its own. An open Mongoose
  connection keeps the process alive, which keeps the Railway container
  running (and billed) 24/7 — exactly what moving off node-cron was meant to
  avoid.
- `src/index.ts` stays as a local-dev-only entry that imports `run.ts` to
  trigger an immediate run with no scheduling — useful for testing without
  waiting on Railway's cron. Railway never uses it; production always runs
  `src/run.ts` via `npm start`.

### 6.2 — Railway deploy
- `package.json`: `"start": "tsx src/run.ts"`, `"dev": "tsx src/index.ts"`.
  `tsx` must be in `dependencies` (not `devDependencies`) so it's present in
  the Railway production build.
- Confirm all env vars are set in the Railway service dashboard
- Set the cron expression **in Railway's service settings, in UTC** — Railway
  cron does not use `CRON_TIMEZONE` or any code-level timezone; see
  `architecture.md` → "Deployment & scheduling" for the fixed-UTC / DST
  decision
- Deploy and verify: the container starts, runs one full digest, sends the
  email, and then **stops** — check the deployment logs show start → run →
  stop, not a process that stays alive indefinitely

**Phase 6 exit check:** A Railway cron trigger runs the container, the digest
email is delivered, the `DigestRecord` is saved, and the container **shuts
down** afterward — not that it stays alive.
