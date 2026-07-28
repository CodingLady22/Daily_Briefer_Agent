# AGENT.md — Coding Agent Instructions

You are building **AI Digest** — a multi-agent LangGraph system that sends a daily HTML email digest about the AI engineering landscape to the user every weekday morning.

---

## How to use the context files

Read all context files before writing a single line of code. They are your source of truth. If anything in your training data conflicts with these files, the files win.

| File | What it tells you |
|---|---|
| `project-overview.md` | What the app does, the full user flow, scope boundaries, and success criteria |
| `architecture.md` | Stack, folder structure, data flow, DB schema, and hard rules you must never break |
| `build-plan.md` | The phased build plan — follow phases in order, do not skip ahead |
| `code-standards.md` | How to write the code — TypeScript rules, naming, folder conventions |
| `library-docs.md` | Project-specific patterns for each third-party library — read before touching that library |
| `email-design.md` | Design tokens and formatting rules for the digest email — the email is the app's entire UI |
| `progress-tracker.md` | Your checklist — mark items complete as you finish them |

---

## How to work

1. **Start every session** by reading `progress-tracker.md` to know where you left off.
2. **Before building any feature**, re-read the relevant section in `project-overview.md` and `architecture.md`.
3. **Follow the phase order** in `build-plan.md`. Never start Phase 2 until all Phase 1 items are checked off in `progress-tracker.md`.
4. **After completing any item**, update `progress-tracker.md` immediately.
5. **When in doubt about a rule**, check `architecture.md` → "Rules the agent must never violate".

---

## Skills (Engineering Loop)

This project uses the JavaScript-Mastery skills on the global scope, installed with:

```
npx skills@latest add JavaScript-Mastery-Pro/skills
```

Use them as described in their README.

```
/architect  →  Build  →  /review  →  Ship
                 ↓
/imprint  (after every UI component)
/remember  (end and start of every session)
/recover   (when something breaks)
```

- **`/architect`** — before building anything. Think through the feature as a senior engineer, align on approach, produce a plan to confirm before code.
- **`/remember save`** — at the end of every session, compress what matters into memory.md. **`/remember restore`** — at the start of every session, restore context and confirm before continuing.
- **`/review`** — after building any feature. Verify it is correct, not just working — plan alignment, system integrity, production readiness.
- **`/recover`** — when something goes wrong. Diagnose targeted fix vs hard reset vs rethink before patching.
- **`/imprint`** — after building any UI component, capture its visual patterns into `ui-registry.md` so later components stay consistent.

Order of authority when a library API is in question:

```
MCP server (real-time docs) → Skills → context/library-docs.md → general knowledge
```

---

## General behaviour

- Never install a package not listed in `architecture.md` without flagging it first.
- Never hardcode secrets. All credentials go in `.env`.
- Never skip TypeScript types. Every function must be fully typed.
- If a phase has an explicit file path in `build-plan.md`, create the file at exactly that path.
- If something is marked **out of scope** in `project-overview.md`, do not build it — even if it seems helpful.
- Before writing any code that uses a third-party library (LangGraph, Resend, Mongoose, etc.), read that library's section in `library-docs.md` first. Those patterns override your general knowledge.
