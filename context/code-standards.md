# Code Standards — AI Digest

## Engineering Mindset

The AI agent on this project operates as a senior engineer. This means:

- **Think before implementing** — understand what is being built and why before writing a single line
- **Read context files first** — never assume, always verify against architecture.md and project-overview.md
- **Scope is sacred** — only build what the current feature requires. Never go beyond scope even if it seems helpful
- **Every feature must be testable** — if it cannot be verified immediately after implementation, it is incomplete
- **Clean over clever** — simple readable code a junior developer can understand beats clever abstractions
- **One thing at a time** — complete one feature fully before touching the next
- **Failures are expected** — wrap agent operations in try/catch, log failures, never let one failure crash the run

---

## TypeScript rules

- Strict mode on. `"strict": true` in `tsconfig.json`.
- No `any`. Use `unknown` and narrow it, or define a proper type.
- No `!` non-null assertions. Guard with an `if` check instead.
- All function parameters and return types must be explicitly typed.
- Use `type` for object shapes and unions. Use `interface` only for things that will be extended.
- Use `zod` for all runtime validation (env vars, LLM outputs, external API responses).

```ts
// ✅ correct
async function fetchItems(url: string): Promise<RawItem[]> { ... }

// ❌ wrong
async function fetchItems(url) { ... }
```

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | camelCase + type suffix | `webSearch.agent.ts`, `digest.model.ts` |
| Variables & functions | camelCase | `rawItems`, `fetchItems()` |
| Types and interfaces | PascalCase | `RawItem`, `DigestSection` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| LangGraph nodes | camelCase, matches agent file name | `webSearchNode` |
| MongoDB collections | camelCase plural | `digestRecords`, `benchmarkSnapshots` |
| Env vars | UPPER_SNAKE_CASE | `RESEND_API_KEY` |

---

## Module rules

- ESM imports only. No `require()`.
- Use named exports everywhere. No default exports except for Mongoose models.
- Import order: Node built-ins → third-party packages → internal modules.
- Use path aliases if the project grows deep. Configure in `tsconfig.json` as `@/` → `src/`.

```ts
// ✅ correct
import path from 'node:path'
import mongoose from 'mongoose'
import { config } from '@/config/index.js'

// ❌ wrong
const config = require('./config')
```

---

## Agent function signature

Every agent must follow this exact signature:

```ts
import type { DigestState } from '../graph/state.js'

export async function webSearchAgent(
  state: DigestState
): Promise<Partial<DigestState>> {
  // ...
  return { rawItems: [...] }
}
```

Agents only return the fields they are responsible for updating. They never mutate `state` directly.

---

## Error handling

- Every `try/catch` must do one of two things: re-throw, or push to `state.errors[]`.
- Never log an error and continue silently.
- **Return only the NEW error, never the accumulated list.** The `errors` reducer in `state.ts` appends (`(curr, next) => [...curr, ...next]`). If you return `[...state.errors, message]`, the reducer appends everything again and every prior error is duplicated. Return just `[message]` and let the reducer do the appending.

```ts
try {
  const items = await fetchItems(url)
  return { rawItems: items }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  return { errors: [`WebSearch: ${message}`] } // just the new one — reducer appends
}
```

- Fatal errors (DB connection failure, missing env vars) should throw and crash the process with a clear message.

---

## LLM calls

- Always use a system prompt. Never rely on the default model behaviour.
- Always parse LLM output with Zod. Never trust raw string output.
- Use `withStructuredOutput()` where available to get typed responses directly.
- Set a reasonable `maxTokens` on every call. Never leave it unbounded.

```ts
// ✅ correct
const llm = getLLM().withStructuredOutput(DigestSectionSchema)
const result = await llm.invoke([
  new SystemMessage(SYNTHESIS_SYSTEM_PROMPT),
  new HumanMessage(JSON.stringify(rawItems))
])

// ❌ wrong
const result = await llm.invoke(`Summarise this: ${rawItems}`)
```

---

## Environment and config

- Only `src/config/index.ts` reads from `process.env`.
- All other files import from config:

```ts
// ✅ correct
import { config } from '@/config/index.js'
const uri = config.mongodbUri

// ❌ wrong
const uri = process.env.MONGODB_URI
```

---

## Database rules

- All DB reads and writes go through Mongoose models in `src/db/`.
- Never write raw queries. Use Mongoose methods.
- Always `await` DB operations. Never fire-and-forget.
- Close the DB connection gracefully on process exit.

---

## Code comments

- Comment the *why*, not the *what*.
- Every agent file gets a top-of-file comment block explaining its role in one sentence.
- Complex LLM prompts get an inline comment explaining the expected output format.

```ts
// Filters raw search results to the last 24h and deduplicates
// against yesterday's digest URLs read from MongoDB.
export async function webSearchAgent(state: DigestState) { ... }
```

---

## File length

- If a file exceeds 200 lines, split it.
- Agent prompts that are long strings live in a separate `*.prompt.ts` file alongside the agent (e.g. `synthesis.agent.ts` + `synthesis.prompt.ts`). Export the prompt as a typed `const`. Do not use `.md` files for prompts — keep them typed and importable, no file-reading at runtime.

---

## Git hygiene (for reference)

- Commit after each phase is complete.
- Commit message format: `phase(N): short description` — e.g. `phase(1): scaffold and DB connection`
- Never commit `.env`.
