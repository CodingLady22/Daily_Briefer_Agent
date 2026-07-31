# AI Digest

A multi-agent [LangGraph](https://langchain-ai.github.io/langgraphjs/) system that researches the AI engineering landscape every weekday and emails a personalised HTML digest — model releases, benchmark movements, framework news, applied-relevant papers, and pricing changes — with every claim backed by a source link.

There is no UI. The email **is** the product.

---

## How it works

```
[Railway cron, weekdays]
        │  starts a container, runs the app once, stops it when the run finishes
        ▼
[Supervisor]
        │
   ┌────┼──────────────┐
   ▼    ▼               ▼
[WebSearch] [Benchmark] [Pricing]     ← run in parallel, cheap-tier LLM
   │  news/blogs   leaderboard    provider pricing pages
   │  last 24h     diffs vs        diffs vs
   │  dedup'd vs   last snapshot   last snapshot
   │  last 7 days
   └───────┬──────────────┘
           ▼
      [Synthesis]                     ← premium-tier LLM
      groups into 6 categories, writes narrative,
      builds comparison tables for 2+ models
           ▼
      [Personalization]               ← premium-tier LLM
      reorders for a TypeScript/LangGraph/RAG stack,
      flags priority items, adds "why this matters"
           ▼
      [EmailFormatter]
      renders Gmail-safe inline-styled HTML
           ▼
     ┌─────┴─────┐
     ▼           ▼
  [Resend]    [MongoDB]
  sends the    saves the digest record
  email        + benchmark/pricing snapshots
```

The app is a **one-shot script, not an always-on process**. Railway's native cron starts a fresh container on schedule, runs the pipeline once end to end, and stops the container the moment the process exits — there's no server sitting idle between runs.

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode, ESM only) |
| Agent framework | LangGraph.js |
| LLM provider | Gemini, OpenAI, or Anthropic — switchable via `.env` |
| Search | Tavily |
| Email delivery | Resend |
| Database | MongoDB (Mongoose) |
| Scheduling | Railway's native cron (no scheduler library in code) |
| Runtime | Node.js 20+ |

---

## Project structure

```
src/
├── agents/            # One file + one prompt file per LangGraph agent
├── graph/              # State annotation, graph wiring, supervisor node
├── tools/              # Web fetch, search, benchmark/pricing scrapers
├── email/              # HTML template (email-design.md compliant) + Resend sender
├── db/                 # Mongoose models — the only files allowed to touch MongoDB
├── config/              # Loads/validates .env, the only file allowed to read process.env
├── types/               # Shared TypeScript types
├── utils/               # Small shared helpers (e.g. key normalization for dedup)
├── run.ts               # Production entry — one-shot run, always exits on its own
└── index.ts              # Local-dev entry — same run, no scheduling, for manual testing

context/                 # Source-of-truth specs a coding agent reads before building
AGENT.md                 # Instructions for a coding agent working on this repo
```

`src/_test-*.ts` files are gitignored, throwaway/reusable scripts used during development to live-test a slice of the pipeline against real services. They aren't part of the app.

---

## Getting started

### Prerequisites

- Node.js 20+
- A MongoDB connection string (e.g. MongoDB Atlas)
- API keys: Tavily, Resend, and at least one of Gemini/OpenAI/Anthropic
- A Resend-verified sending domain (a plain Gmail-style `from` address will be rejected)

### Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `LLM_PROVIDER` | `"gemini"` \| `"openai"` \| `"anthropic"` |
| `LLM_MODEL_CHEAP` | Used for extraction (WebSearch, Benchmark, Pricing) |
| `LLM_MODEL_PREMIUM` | Used for reasoning (Synthesis, Personalization) |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Only the key matching `LLM_PROVIDER` is required |
| `TAVILY_API_KEY` | Powers the search tool |
| `RESEND_API_KEY` | Email delivery |
| `RESEND_FROM` | Must be a verified domain in Resend |
| `DIGEST_TO_EMAIL` | Where the digest is sent |
| `CRON_TIMEZONE` | Documentation only — the real schedule is set in Railway, in UTC |

### Run it

```bash
npm run dev     # runs one digest immediately, local testing, no scheduling
npm start        # same run — this is what Railway's cron executes in production
npm run typecheck
```

Both `dev` and `start` run one full digest and then the process exits on its own — success or failure. A successful run sends a real email and saves a `DigestRecord` to MongoDB; a fatal error sends a one-line failure-alert email instead.

### Deployment

Deployed on Railway. Railway (Nixpacks) auto-detects the Node app and runs `npm start`. The schedule (a UTC cron expression) is configured in the Railway service's cron settings, not in code — see `context/architecture.md` → "Deployment & scheduling" for the UTC/DST timezone decision.

---

## Exploring or extending this repo with a coding agent

This project is built and maintained primarily through a coding agent (Claude Code), and the repo is set up so any coding agent can pick it up cold:

1. **Start at [`AGENT.md`](./AGENT.md)** — it explains what to build, the reading order for the `context/` files, and the rules the agent must never violate.
2. **Read the `context/` files in order** before making changes:
   - `project-overview.md` — what the app does, user flow, scope
   - `architecture.md` — stack, folder structure, data flow, DB schema, hard rules
   - `build-plan.md` — the phased build plan
   - `code-standards.md` — TypeScript/naming/error-handling conventions
   - `library-docs.md` — project-specific patterns per third-party library
   - `email-design.md` — the email's design tokens and formatting rules (the email is the entire UI)
   - `progress-tracker.md` — what's done, what's next
3. **Check `progress-tracker.md` first** in any new session — it's the checklist of what's built and what's left.

If you're using Claude Code specifically, this repo also uses the [JavaScript-Mastery skills](https://github.com/JavaScript-Mastery-Pro/skills) (`/architect`, `/review`, `/remember`, `/recover`, `/imprint`) — see `AGENT.md` for how they fit into the workflow.

No web UI exists to click around — the fastest way to see the app work is `npm run dev` with a filled-in `.env`, which triggers one real end-to-end run and a real email.
