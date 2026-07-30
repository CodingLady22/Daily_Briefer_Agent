# Library Docs — AI Digest

Project-specific usage patterns for every third-party library in this project. This file only covers how we use each library in **this** project — rules, patterns, and constraints specific to AI Digest.

Read the relevant section before implementing any feature that touches these libraries.

---

## Before Using Any Library

Before implementing any feature that uses a third-party library:

1. **Check AGENT.md** at the project root — it lists the context files and how to use them.
2. **Check if an MCP server is configured** for that library. If one is available, use it before falling back to general knowledge.
3. **Read this file** for project-specific patterns that override general library knowledge.

The order of authority is:

```
MCP server (real-time docs) → AGENT.md context files → This file (project rules) → General training knowledge
```

Never rely on general training knowledge alone for library APIs — they change frequently and training data may be outdated.

---

## LangGraph.js

**Check first:** Check AGENT.md and any configured LangChain/LangGraph MCP server for the latest `StateGraph` and annotation patterns.

### State definition

State is a single `Annotation.Root`. Every agent reads from it and returns only the slice it owns.

```typescript
// src/graph/state.ts
import { Annotation } from "@langchain/langgraph";
import type {
  RawItem,
  BenchmarkDelta,
  PricingDelta,
  DigestSection,
  PersonalisedDigest,
  EmailPayload,
} from "../types/index.js";

export const DigestState = Annotation.Root({
  rawItems: Annotation<RawItem[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),
  benchmarkDeltas: Annotation<BenchmarkDelta[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),
  pricingDeltas: Annotation<PricingDelta[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),
  sections: Annotation<DigestSection[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),
  personalisedDigest: Annotation<PersonalisedDigest | null>({
    reducer: (curr, next) => next,
    default: () => null,
  }),
  emailPayload: Annotation<EmailPayload | null>({
    reducer: (curr, next) => next,
    default: () => null,
  }),
  errors: Annotation<string[]>({
    reducer: (curr, next) => [...curr, ...next], // errors accumulate
    default: () => [],
  }),
  runDate: Annotation<string>({
    reducer: (curr, next) => next,
    default: () => new Date().toISOString(),
  }),
});

export type DigestStateType = typeof DigestState.State;
```

### Graph wiring

WebSearch, Benchmark, and Pricing run in parallel, then everything funnels through synthesis → personalization → email.

```typescript
// src/graph/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { DigestState } from "./state.js";

const graph = new StateGraph(DigestState)
  .addNode("webSearch", webSearchAgent)
  .addNode("benchmark", benchmarkAgent)
  .addNode("pricing", pricingAgent)
  .addNode("synthesis", synthesisAgent)
  .addNode("personalization", personalizationAgent)
  .addNode("emailFormatter", emailFormatterAgent)
  // fan out
  .addEdge(START, "webSearch")
  .addEdge(START, "benchmark")
  .addEdge(START, "pricing")
  // fan in — synthesis waits for all three
  .addEdge("webSearch", "synthesis")
  .addEdge("benchmark", "synthesis")
  .addEdge("pricing", "synthesis")
  .addEdge("synthesis", "personalization")
  .addEdge("personalization", "emailFormatter")
  .addEdge("emailFormatter", END);

export const digestGraph = graph.compile();
```

**Rules:**

- The `errors` field is the only one that appends — every other field replaces. Never change this.
- Agents return `Partial<DigestStateType>` — only the fields they own. Never mutate `state` directly.
- Synthesis has three incoming edges — LangGraph waits for all three parallel agents before running it. Never wire synthesis to run before all three finish.
- Compile the graph once and export it — never compile inside the cron callback.

---

## Multiple LLM Providers (LangChain)

**Check first:** Check AGENT.md for provider-specific skills. Model names change — verify current ones.

### The tiered factory

One factory picks the provider and the model tier. Cheap tier for extraction, premium for reasoning.

```typescript
// src/config/index.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

type Tier = "cheap" | "premium";

export function getLLM(tier: Tier): BaseChatModel {
  const model =
    tier === "cheap" ? config.llmModelCheap : config.llmModelPremium;

  switch (config.llmProvider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({ model, apiKey: config.geminiApiKey });
    case "openai":
      return new ChatOpenAI({ model, apiKey: config.openaiApiKey });
    case "anthropic":
      return new ChatAnthropic({ model, apiKey: config.anthropicApiKey });
    default:
      throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
  }
}
```

### Structured output

Never trust raw string output. Always bind a Zod schema.

```typescript
import { z } from "zod";

const SectionSchema = z.object({
  category: z.string(),
  narrative: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(), // every item MUST have a source URL
      summary: z.string(),
    }),
  ),
});

const llm = getLLM("premium").withStructuredOutput(SectionSchema);
const result = await llm.invoke([
  new SystemMessage(SYNTHESIS_SYSTEM_PROMPT),
  new HumanMessage(JSON.stringify(rawItems)),
]);
```

**Rules:**

- WebSearch + Benchmark + Pricing agents call `getLLM("cheap")`. Synthesis + Personalization call `getLLM("premium")`. Never flip this — it is the core cost-control rule.
- Always `.withStructuredOutput(schema)` — never parse raw model strings by hand.
- Every item schema includes `url: z.string().url()`. No claim reaches the email without a source. This is non-negotiable.
- Always set a `maxTokens` on the model when the output is bounded — never leave it open.

---

## Mongoose (MongoDB)

**Check first:** Check AGENT.md for a MongoDB/Mongoose skill or MCP server.

### Connection

```typescript
// src/db/connection.ts
import mongoose from "mongoose";
import { config } from "../config/index.js";

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log("MongoDB connected");
}
```

### Models — match architecture.md schemas exactly

```typescript
// src/db/digest.model.ts
import { Schema, model } from "mongoose";

const digestSchema = new Schema({
  date: { type: Date, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  sections: { type: Array, default: [] },
  sourceUrls: { type: [String], default: [] },
  itemCount: { type: Number, default: 0 },
  runDurationMs: { type: Number, default: 0 },
  runErrors: { type: [String], default: [] }, // not `errors` — reserved on Mongoose Documents
  createdAt: { type: Date, default: Date.now },
});

export const DigestRecord = model("DigestRecord", digestSchema);
```

### The dedup query (last 7 days)

```typescript
// Read the last 7 days of digests, collect every URL already covered
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const recent = await DigestRecord.find({ date: { $gte: sevenDaysAgo } })
  .select("sourceUrls")
  .lean();

const seenUrls = new Set(recent.flatMap((d) => d.sourceUrls));
// filter new items: keep only those whose url is NOT in seenUrls
```

### The snapshot query (benchmark + pricing deltas)

```typescript
// Read the single most recent snapshot to diff against
const last = await BenchmarkSnapshot.findOne().sort({ date: -1 }).lean();
```

**Rules:**

- All DB reads and writes go through models in `src/db/` — never query from an agent file directly.
- Always `.lean()` on reads you only need to read (faster, plain objects).
- Always `await` every DB call — never fire-and-forget.
- Dedup always looks back 7 days — never just yesterday. A story can resurface mid-week.
- Snapshot reads always use `.sort({ date: -1 }).findOne()` to get the latest — never assume order.
- **Never save a snapshot with fewer than 5 items.** A low-yield scrape (LLM off day, rate limit, truncated response) must not overwrite the baseline — skip the save, keep yesterday's, log it. Losing the baseline silently corrupts every future diff.
- **Dedupe by natural key before saving a snapshot** (`modelName::benchmark` / `modelName::provider`). Duplicate rows skew the next day's diff non-deterministically depending on array order. The key is built via the shared `normalizeKey()` helper (`src/utils/key.ts`) — lowercases, trims, and collapses spaces/underscores so casing/formatting drift doesn't create a false new entry — but the stored/displayed `modelName` always stays the original, non-normalized value from extraction.
- Save the new benchmark and pricing snapshots **before** the run ends, so tomorrow has something to diff against.

---

## Resend

**Check first:** Check AGENT.md for a Resend skill or MCP server.

### Sending the digest

```typescript
// src/email/sender.ts
import { Resend } from "resend";
import { config } from "../config/index.js";
import type { EmailPayload } from "../types/index.js";

const resend = new Resend(config.resendApiKey);

export async function sendDigest(payload: EmailPayload): Promise<void> {
  const { data, error } = await resend.emails.send({
    from: config.resendFrom,
    to: config.digestToEmail,
    subject: payload.subject,
    html: payload.html,
  });

  if (error) throw new Error(`Resend failed: ${error.message}`);
  console.log(`Digest sent, id: ${data?.id}`);
}
```

### The failure alert

```typescript
export async function sendFailureAlert(reason: string): Promise<void> {
  await resend.emails.send({
    from: config.resendFrom,
    to: config.digestToEmail,
    subject: "AI Digest run failed",
    html: `<p>AI Digest run failed: ${reason}</p>`,
  });
}
```

**Rules:**

- `from` must be a verified domain in Resend — a plain gmail address will be rejected.
- Always check the `error` field on the send result — Resend returns errors in the response, it does not always throw.
- Never send the digest if it has zero items — the EmailFormatter validates content first and throws before we reach here.
- HTML must use **inline styles only** — Gmail strips `<style>` blocks and external CSS.
- The failure alert is plain and tiny — never dress it up. Its only job is to tell you a run broke.

---

## node-cron

**Check first:** node-cron is stable, but confirm the timezone option is still supported.

### Scheduling the run

```typescript
// src/scheduler/cron.ts
import cron from "node-cron";
import { config } from "../config/index.js";
import { digestGraph } from "../graph/graph.js";
import { sendFailureAlert } from "../email/sender.js";

export function startScheduler(): void {
  // 0 7 * * 1-5  →  07:00, Monday to Friday
  cron.schedule(
    "0 7 * * 1-5",
    async () => {
      const start = Date.now();
      try {
        console.log("AI Digest run started");
        await digestGraph.invoke({});
        console.log(`AI Digest run finished in ${Date.now() - start}ms`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("AI Digest run failed:", reason);
        await sendFailureAlert(reason); // never let a failure go unnoticed
      }
    },
    { timezone: config.cronTimezone },
  );

  console.log("Scheduler started");
}
```

**Rules:**

- Cron expression is `0 7 * * 1-5` — 7am, weekdays only. Never run on weekends.
- Timezone always comes from `config.cronTimezone` (`Europe/Rome`) — never hardcode or rely on server local time. A Railway server may run in UTC.
- The cron callback must never throw uncaught — always wrap in try/catch and call `sendFailureAlert`. An unhandled throw here can crash the whole process.
- Compile the graph once at import time — never inside the callback.

---

## axios + cheerio (web fetch tool)

**Check first:** These are stable. The important rule is *when not to use them*.

### Fetching and stripping a page

```typescript
// src/tools/webFetch.tool.ts
import axios from "axios";
import * as cheerio from "cheerio";

export async function webFetch(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { timeout: 10_000 });
    const $ = cheerio.load(res.data);
    $("script, style, nav, footer").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  } catch {
    return null; // never throw — the agent decides what to do with null
  }
}
```

**Rules:**

- `webFetch` returns `null` on any failure — it never throws. The calling agent handles the null.
- **Do not use cheerio on JavaScript-rendered pages** (HuggingFace leaderboard, LiveBench, some pricing pages). A plain fetch returns an empty HTML shell and cheerio finds nothing. For those, use the search tool instead, or a JSON/API endpoint if the source exposes one. This is the single most common trap in this project.
- Always set a timeout (10s) — never leave a fetch unbounded.
- Use `webFetch` for static article pages (blogs, changelogs, arXiv abstracts) — that is what it is good for.

---

## Tavily (search tool)

**Check first:** Check AGENT.md for a Tavily skill. Tavily ships via `@langchain/community`.

### Searching

```typescript
// src/tools/search.tool.ts
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { config } from "../config/index.js";
import type { RawItem } from "../types/index.js";

const tavily = new TavilySearchResults({
  apiKey: config.tavilyApiKey,
  maxResults: 5,
});

export async function search(query: string): Promise<RawItem[]> {
  const raw = await tavily.invoke(query);
  const parsed = JSON.parse(raw) as Array<{
    title: string;
    url: string;
    content: string;
  }>;
  return parsed.map((r) => ({
    title: r.title,
    url: r.url,
    source: new URL(r.url).hostname,
    summary: r.content,
    publishedAt: null, // Tavily does not always return a date
  }));
}
```

**Rules:**

- Tavily returns a JSON **string** — always `JSON.parse` it, never use it raw.
- `publishedAt` is often missing — the WebSearch agent must handle a null date, not assume one.
- Search is the fallback for JS-rendered pages that `webFetch` can't read — benchmark and pricing agents lean on it.
- Keep `maxResults` small (5) — this is a cost and noise control.
