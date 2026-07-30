// Stub renderer for Phase 4.6 — EmailFormatter needs something to call before
// Phase 5.1 exists. Signature matches build-plan.md 5.1 exactly so swapping in
// the real Gmail-safe, EMAIL_TOKENS-driven template (per email-design.md) is a
// drop-in replacement with no caller changes.
import type { PersonalisedDigest } from "../types/index.js";

export function renderEmail(digest: PersonalisedDigest, runDate: string): string {
  const sectionsHtml = digest.sections
    .map((section) => {
      const itemsHtml = section.items
        .map(
          (item) =>
            `<li><a href="${item.url}">${item.title}</a> — ${item.summary}</li>`,
        )
        .join("");
      const tableHtml = section.comparisonTable
        ? `<table><tr>${section.comparisonTable.headers.map((h) => `<th>${h}</th>`).join("")}</tr>${section.comparisonTable.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
            .join("")}</table>`
        : "";
      return `<h2>${section.category}</h2><p>${section.narrative}</p><ul>${itemsHtml}</ul>${tableHtml}`;
    })
    .join("");

  return `<html><body><h1>AI Digest — ${runDate}</h1>${sectionsHtml}</body></html>`;
}
