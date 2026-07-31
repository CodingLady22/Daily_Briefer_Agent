# Project Overview — AI Digest

## What this app does

AI Digest is a multi-agent background service that runs every weekday morning. It researches the AI engineering landscape, synthesises what it finds, personalises the output for the user's specific stack, and delivers a rich HTML email to their inbox via Resend.

Think of it as a personal AI research assistant that wakes up every morning, reads the internet, and sends a curated briefing tailored to someone who builds AI agents with TypeScript and LangGraph.

---

## The problem it solves

Staying current as an applied AI engineer is a full-time job on its own. Models change, benchmarks shift, new frameworks emerge, and pricing updates can break architecture decisions. Manually checking HuggingFace, arXiv, provider changelogs, and observability tool blogs every day is not sustainable. This agent does it automatically.

---

## Full user flow

### Step 1 — Trigger (automated)
Railway's native cron starts a fresh container Monday through Friday, targeting ~7:00am Europe/Rome (a fixed UTC expression, so it drifts by up to an hour across DST — see `architecture.md`). The container runs the app once end to end and stops when it finishes; there is no always-on process.

### Step 2 — WebSearch agent runs
Crawls a curated set of sources (see `architecture.md`) for new content published in the last 24 hours. Collects raw items: title, URL, source, summary snippet, publication date. Stores results in shared LangGraph state.

### Step 3 — Benchmark agent runs
Checks benchmark leaderboards and model evaluation pages for score changes since the last run. Records which models moved, by how much, and on which evals. Flags significant deltas (>2 points on a major benchmark). Reads the previous run's benchmark snapshot from MongoDB to calculate deltas. Stores results in shared state.

### Step 3b — Pricing agent runs
Checks provider pricing pages for changes since the last run. Reads the previous `PricingSnapshot` from MongoDB, calculates deltas, and flags any change (price moves are rare and always worth noting). Stores results in shared state.

### Step 4 — Synthesis agent runs
Takes all raw items from Steps 2, 3, and 3b. Groups them into categories:
- Model releases & updates
- Benchmark movements
- Framework & tooling news (observability, guardrails, RAG)
- Research papers (applied relevance only)
- Pricing & rate limit changes
- Reliability incidents

Writes a narrative summary for each category. Compares models or frameworks where relevant (e.g. "GPT-4o vs Gemini 1.5 Pro on coding tasks this week"). Every claim includes a source URL. Stores the structured digest in shared state.

### Step 5 — Personalization agent runs
Reads the synthesised digest and filters/reorders content based on the user's known stack:
- TypeScript-first (deprioritise Python-only releases)
- LangGraph / LangChain user
- Building RAG pipelines and WhatsApp-first agents
- Interested in observability (LangSmith, Weave, Phoenix) and guardrails
- Applying for applied AI engineering roles — flag anything relevant to that transition

Adds a "Why this matters for you" note to the top items. Marks items as **priority** or **FYI**.

### Step 6 — Email Formatter agent runs
Takes the personalised digest and renders it as a rich HTML email. Sections are clearly divided. Priority items appear first. Every claim has a clickable source link. Stores the final HTML in MongoDB.

### Step 7 — Delivery
Resend sends the HTML email to the user's address. The email record (date, subject, HTML, source URLs) is saved to MongoDB. Run metadata (timestamp, item counts, any errors) is logged.

---

## Functionalities

- Automated daily research across 15+ curated sources
- Model comparison across commercial and open-source options
- Benchmark delta tracking with historical memory
- Framework radar (observability, guardrails, vector DBs)
- arXiv paper filtering for applied relevance only
- Pricing change detection with historical memory
- Failure alert email when a run breaks
- Cheap model for extraction, premium model for reasoning (cost control)
- Personalisation layer tuned to the user's stack and career goals
- Rich HTML email with sections, priority flags, and source citations
- MongoDB persistence for state history and past digests
- Error logging per run

---

## In scope

- Six LangGraph agents (WebSearch, Benchmark, Pricing, Synthesis, Personalization, EmailFormatter)
- LangGraph orchestrator (supervisor pattern)
- MongoDB for state persistence and digest history
- Resend for email delivery
- Railway's native cron, running the app as a one-shot script (no scheduler library, no always-on process)
- Rich HTML email template
- `.env`-based configuration for all secrets and settings
- TypeScript throughout

## Out of scope

- A web UI or dashboard
- User authentication or multi-user support
- The user manually triggering runs (cron only)
- Slack, WhatsApp, or any delivery channel other than email
- Fine-tuning or training any models
- Storing or processing personal data beyond the user's own email address
- Payment or subscription logic

---

## Success criteria

The app is working correctly when all of the following are true:

1. An email arrives in the inbox every weekday between 7:00–7:15am.
2. The email contains at least 3 distinct categories of content.
3. Every item in the email includes a working source URL.
4. The Benchmark section shows deltas compared to the previous run (not absolute scores alone).
5. At least one item includes a "Why this matters for you" personalisation note.
6. No duplicate items appear that were already covered in the previous day's email.
7. The run completes without unhandled errors in the logs.
8. The digest record is saved to MongoDB after each successful run.
9. Items are formatted as bullet points; any section with 2+ compared models/frameworks renders a comparison table.
10. The email is skimmable in under 2 minutes — no long paragraphs anywhere.
