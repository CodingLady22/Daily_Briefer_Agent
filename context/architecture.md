# Architecture — AI Digest

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Agent framework | LangGraph.js |
| LLM provider | Configurable via env — Gemini, OpenAI, or Anthropic |
| Email delivery | Resend |
| Database | MongoDB (Mongoose) |
| Scheduler | node-cron |
| Deployment | Railway (VPS, always-on Node.js process) |
| Runtime | Node.js 20+ |

---

## Folder structure

```
ai-digest/
├── src/
│   ├── agents/
│   │   ├── webSearch.agent.ts
│   │   ├── webSearch.prompt.ts
│   │   ├── benchmark.agent.ts
│   │   ├── synthesis.agent.ts
│   │   ├── synthesis.prompt.ts
│   │   ├── personalization.agent.ts
│   │   ├── personalization.prompt.ts
│   │   └── emailFormatter.agent.ts
│   ├── graph/
│   │   ├── graph.ts           # LangGraph graph definition
│   │   ├── state.ts           # Shared state annotation
│   │   └── supervisor.ts      # Supervisor / orchestrator node
│   ├── tools/
│   │   ├── webFetch.tool.ts
│   │   ├── search.tool.ts
│   │   └── benchmarkScraper.tool.ts
│   ├── email/
│   │   ├── template.ts        # HTML email renderer
│   │   └── sender.ts          # Resend integration
│   ├── db/
│   │   ├── connection.ts
│   │   ├── digest.model.ts
│   │   └── benchmarkSnapshot.model.ts
│   ├── scheduler/
│   │   └── cron.ts
│   ├── config/
│   │   └── index.ts           # Loads and validates env vars
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   └── index.ts               # App entry point
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

---

## System boundaries and data flow

```
[node-cron, 7am weekdays]
        │
        ▼
[Orchestrator / Supervisor]
        │
   ┌────┴─────────────────────────────────┐
   │                                      │
   ▼                                      ▼
[WebSearch agent]              [Benchmark agent]
   │  fetches last 24h news       │  fetches eval leaderboards
   │  returns: RawItem[]          │  diffs vs MongoDB snapshot
   │                              │  returns: BenchmarkDelta[]
   └────────────┬─────────────────┘
                │  writes to LangGraph shared state
                ▼
        [Synthesis agent]
          groups, compares, writes narrative
          attaches source URLs to every claim
          returns: DigestSection[]
                │
                ▼
        [Personalization agent]
          reorders by stack relevance
          adds "Why this matters" notes
          flags priority vs FYI
          returns: PersonalisedDigest
                │
                ▼
        [EmailFormatter agent]
          renders rich HTML email
          returns: EmailPayload
                │
         ┌──────┴──────┐
         ▼             ▼
      [Resend]      [MongoDB]
      sends email   saves digest record + benchmark snapshot
```

---

## Database schemas

### DigestRecord
Stores every sent email for history and deduplication.

```ts
{
  _id: ObjectId,
  date: Date,                  // run date
  subject: string,
  html: string,                // full rendered HTML
  sections: PersonalisedSection[], // final personalised content, as actually emailed
                                    // (includes priority + whyThisMatters per item)
  sourceUrls: string[],        // all cited URLs
  itemCount: number,
  runDurationMs: number,
  runErrors: string[],         // any non-fatal errors during the run — named
                                // `runErrors`, not `errors`: Mongoose Documents
                                // reserve `.errors` for ValidationError storage
  createdAt: Date
}
```

### BenchmarkSnapshot
One document per run. Used by the Benchmark agent to calculate deltas.

```ts
{
  _id: ObjectId,
  date: Date,
  scores: {
    modelName: string,
    benchmark: string,         // e.g. "MMLU", "HumanEval", "HELM"
    score: number,
    source: string             // URL
  }[],
  createdAt: Date
}
```

### PricingSnapshot
One document per run. Lets the digest say "Gemini Flash price dropped since last week".

```ts
{
  _id: ObjectId,
  date: Date,
  prices: {
    modelName: string,
    provider: string,          // "openai" | "anthropic" | "google"
    inputPer1M: number,        // USD per 1M input tokens
    outputPer1M: number,       // USD per 1M output tokens
    source: string             // URL
  }[],
  createdAt: Date
}
```

---

## Sources the WebSearch agent monitors

### Model releases & updates
- https://huggingface.co/blog
- https://openai.com/news
- https://www.anthropic.com/news
- https://deepmind.google/discover/blog
- https://mistral.ai/news

### Benchmarks & evals
- https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard
- https://crfm.stanford.edu/helm
- https://livebench.ai

### Frameworks & tooling
- https://blog.langchain.dev
- https://changelog.langchain.com
- https://weave-docs.wandb.ai (Weave)
- https://docs.arize.com/phoenix (Phoenix)
- https://www.guardrailsai.com/blog

### Research (applied filter)
- https://arxiv.org/list/cs.AI/recent
- https://arxiv.org/list/cs.CL/recent

### Pricing (tracked for deltas)
- https://openai.com/api/pricing
- https://www.anthropic.com/pricing
- https://ai.google.dev/pricing

### Reliability / incidents (status pages)
- https://status.openai.com
- https://status.anthropic.com
- https://status.cloud.google.com

### Broader AI engineering news
- https://www.latent.space/archive
- https://simonwillison.net

---

## Rules the agent must never violate

1. **Never hardcode secrets.** API keys, DB URIs, and email addresses must come from `.env` only.
2. **Never skip TypeScript types.** Every function parameter, return value, and state field must be explicitly typed. No `any`.
3. **Never write to MongoDB outside the `db/` folder.** All DB operations go through Mongoose models in `src/db/`.
4. **Never send an email if the digest has zero items.** The EmailFormatter must validate content before calling Resend.
5. **Never swallow errors silently.** Every catch block must either re-throw or log to the run's `errors[]` array.
6. **Never start a new phase until the previous phase's checklist items are all complete** in `progress-tracker.md`.
7. **Never add a package not listed in this file** without flagging it in a comment and updating this architecture file.
8. **Always attach a source URL to every digest item.** No claim goes into the email without a citation.
9. **Always check MongoDB for yesterday's digest before writing today's** to prevent duplicate content.
10. **Never use `require()`.** ESM imports only throughout the project.
11. **Always use the cheap model tier for extraction, the premium tier for reasoning.** WebSearch and Benchmark agents do simple extraction — use the cheap model. Synthesis and Personalization do real reasoning — use the premium model. Two env vars control this: `LLM_MODEL_CHEAP` and `LLM_MODEL_PREMIUM`.
12. **Always dedupe against the last 7 days of digests, not just yesterday.** A story can resurface mid-week. Read the last 7 `DigestRecord` docs and skip any URL already covered.
13. **Never overwrite a snapshot with a near-empty extraction.** Before saving a `BenchmarkSnapshot` or `PricingSnapshot`, require a minimum of 5 extracted items. If fewer, skip the save, keep yesterday's snapshot as the baseline, and log `"<agent>: low-yield extraction (N items), snapshot not saved"` to `errors[]`. A bad scrape must never destroy the diff history.
14. **Always dedupe deltas by their natural key before diffing and saving.** For benchmarks the key is `modelName::benchmark`; for pricing it is `modelName::provider`. Cross-citing sources produce the same pair twice — collapse duplicates deterministically (last write wins after sorting by source) before computing deltas or writing the snapshot. Normalize each key component before building the key: lowercase, trim, and collapse spaces/underscores to single hyphens. Normalize ONLY the match key — always keep the original extracted model name for display in the digest and snapshot. This is deterministic string cleanup, not fuzzy or LLM-based matching.
15. **Scraper tools must use `Promise.allSettled`, never `Promise.all`.** One failing query (e.g. a rate-limited source) must not discard the successful ones. Keep partial results and log the failed queries to `errors[]` — mirror how `webSearchAgent` handles per-source failure.
16. **Agents return only their NEW errors, never the accumulated list.** The `errors` reducer appends. Return `[message]`, not `[...state.errors, message]`, or every prior error duplicates on each failure.
17. **Never name a Mongoose schema field `errors`.** Mongoose Documents reserve `.errors` for `ValidationError` storage — a schema field of that name shadows it and triggers a runtime warning. Use `runErrors` (see `DigestRecord`) or another non-reserved name instead. This applies only to Mongoose schema fields — the unrelated LangGraph `DigestState.errors` field and every agent's local `errors` variable are fine as-is.

---

## Approved packages

```json
{
  "@langchain/langgraph": "latest",
  "@langchain/core": "latest",
  "@langchain/google-genai": "latest",
  "@langchain/openai": "latest",
  "@langchain/anthropic": "latest",
  "@langchain/community": "latest",
  "mongoose": "latest",
  "resend": "latest",
  "node-cron": "latest",
  "dotenv": "latest",
  "zod": "latest",
  "axios": "latest",
  "cheerio": "latest",
  "typescript": "latest",
  "tsx": "latest",
  "@types/node": "latest",
  "@types/node-cron": "latest"
}
```
