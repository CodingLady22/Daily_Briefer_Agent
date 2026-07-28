# Email Design — AI Digest

The email is the entire UI of this app. These tokens and rules are the source of truth for how the digest looks. Functionality and readability come first — the design exists to make content scannable, never to decorate.

---

## Tokens

Emails can't use CSS variables reliably (Gmail strips `<style>` blocks), so these are defined as TS constants in `src/email/template.ts` and applied as inline styles.

```typescript
export const EMAIL_TOKENS = {
  // Palette — purple primary, red for urgency only
  accent: "#7C3AED",          // purple — headers, section titles, links
  accentDark: "#5B21B6",      // dark purple — email header background
  accentLight: "#F3E8FF",     // pale purple — table header rows, subtle highlights
  urgent: "#DC2626",          // red — priority badges and significant deltas ONLY
  urgentLight: "#FEE2E2",     // pale red — priority item background

  // Neutrals
  background: "#F6F7FB",      // page background
  surface: "#FFFFFF",         // content card
  border: "#E7EAF3",
  textPrimary: "#101828",
  textSecondary: "#6A7282",
  textMuted: "#99A1AF",

  // Type scale (px)
  h1: 20,                     // email title
  h2: 16,                     // section headings
  body: 14,
  small: 12,                  // timestamps, source links
} as const;
```

---

## Layout rules

- Single column, max-width 600px, centered — never wider (mobile email clients)
- Table-based layout (`<table>`, `<tr>`, `<td>`) — never flexbox or grid, email clients don't support them
- Header: dark purple (`accentDark`) background, white text, digest title + date
- Content: white card on `background`, 24px padding
- Footer: muted text, run timestamp, small

---

## Content formatting rules

These rules exist because the reader skims this email over coffee. Optimize for scanning.

1. **Items are bullet points, never paragraphs.** One `<li>` per item: bolded title as a link, dash, one-sentence summary.

```html
<li style="margin-bottom:8px;font-size:14px;color:#101828;">
  <a href="{url}" style="color:#7C3AED;font-weight:600;text-decoration:none;">{title}</a>
  — {one sentence summary}
</li>
```

2. **Comparisons are tables, never prose.** Whenever a section has a `comparisonTable`, render it as an HTML table: pale purple header row, alternating white/`background` body rows, 13px text.

```html
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <tr style="background:#F3E8FF;">
    <th style="padding:8px;text-align:left;border:1px solid #E7EAF3;color:#5B21B6;">Model</th>
    ...
  </tr>
  ...
</table>
```

3. **Priority items** go in a highlighted block at the top: pale red background, red left border (4px), the "Why this matters for you" note in italics below the item.

4. **Red means urgent — nothing else.** Priority badges, significant benchmark drops, price increases. Never use red for decoration. If everything is red, nothing is.

5. **Section headings** are purple (`accent`), 16px, bold, with a thin border-bottom.

6. **Every item ends with its source.** The item title itself is the link — no separate "source:" line needed for bullets. Table rows get a compact link in the last column.

7. **Narrative text** (the 2–4 sentence category summary) sits directly under the section heading, 14px, `textSecondary`. This is the only place short prose is allowed.

8. **No images, no emoji in headings, no external fonts.** System font stack: `-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`. Images break in many clients and add nothing here.

---

## Email skeleton

```
┌─────────────────────────────────┐
│  AI Digest — Tue 7 Jul 2026     │  ← dark purple header
├─────────────────────────────────┤
│  ⚑ PRIORITY                     │  ← pale red block, red left border
│  • Item — why this matters      │
├─────────────────────────────────┤
│  Model releases & updates       │  ← purple heading
│  short narrative...             │
│  • bullet item — summary        │
│  • bullet item — summary        │
│  [comparison table if 2+ models]│
├─────────────────────────────────┤
│  Benchmark movements            │
│  ...                            │
├─────────────────────────────────┤
│  footer — run time, muted       │
└─────────────────────────────────┘
```

---

## Rules the agent must never violate

- Inline styles only — no `<style>` blocks, no classes, no external CSS
- Table-based layout only — no flexbox, no grid
- Max-width 600px always
- Red is reserved for urgency — never decorative
- Bullets for items, tables for comparisons, prose only for the short section narratives
- Every color comes from `EMAIL_TOKENS` — never hardcode a hex outside the tokens object
