// Renders the personalised digest into a Gmail-safe HTML email per email-design.md.
import type {
  ComparisonTable,
  PersonalisedDigest,
  PersonalisedItem,
  PersonalisedSection,
} from "../types/index.js";

export const EMAIL_TOKENS = {
  accent: "#7C3AED",
  accentDark: "#5B21B6",
  accentLight: "#F3E8FF",
  urgent: "#DC2626",
  urgentLight: "#FEE2E2",
  background: "#F6F7FB",
  surface: "#FFFFFF",
  border: "#E7EAF3",
  textPrimary: "#101828",
  textSecondary: "#6A7282",
  textMuted: "#99A1AF",
  h1: 20,
  h2: 16,
  body: 14,
  small: 12,
} as const;

const FONT_STACK =
  "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHeaderDate(runDate: string): string {
  return new Date(runDate).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Priority items already render inline (highlighted) in their own category
// section — the top block is only the guaranteed top-3 whyThisMatters picks,
// so nothing is ever duplicated in the email.
function collectSpotlightItems(
  sections: PersonalisedSection[],
): PersonalisedItem[] {
  return sections.flatMap((section) =>
    section.items.filter((item) => item.whyThisMatters !== null),
  );
}

function renderBulletItem(item: PersonalisedItem): string {
  const highlightStyle = item.priority
    ? `background:${EMAIL_TOKENS.urgentLight};border-left:4px solid ${EMAIL_TOKENS.urgent};padding:8px 8px 8px 12px;`
    : "";
  const note = item.whyThisMatters
    ? `<div style="font-style:italic;color:${EMAIL_TOKENS.textSecondary};font-size:${EMAIL_TOKENS.small}px;margin-top:4px;">${escapeHtml(item.whyThisMatters)}</div>`
    : "";
  return `<li style="margin-bottom:8px;font-size:${EMAIL_TOKENS.body}px;color:${EMAIL_TOKENS.textPrimary};${highlightStyle}">
    <a href="${escapeHtml(item.url)}" style="color:${EMAIL_TOKENS.accent};font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
    — ${escapeHtml(item.summary)}
    ${note}
  </li>`;
}

function renderComparisonTable(table: ComparisonTable): string {
  const headerRow = table.headers
    .map(
      (h) =>
        `<th style="padding:8px;text-align:left;border:1px solid ${EMAIL_TOKENS.border};color:${EMAIL_TOKENS.accentDark};">${escapeHtml(h)}</th>`,
    )
    .join("");
  const bodyRows = table.rows
    .map((row, i) => {
      const cells = row
        .map(
          (cell) =>
            `<td style="padding:8px;border:1px solid ${EMAIL_TOKENS.border};font-size:13px;color:${EMAIL_TOKENS.textPrimary};">${escapeHtml(cell)}</td>`,
        )
        .join("");
      const rowBg = i % 2 === 0 ? EMAIL_TOKENS.surface : EMAIL_TOKENS.background;
      return `<tr style="background:${rowBg};">${cells}</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
    <tr style="background:${EMAIL_TOKENS.accentLight};">${headerRow}</tr>
    ${bodyRows}
  </table>`;
}

function renderSpotlightBlock(sections: PersonalisedSection[]): string {
  const items = collectSpotlightItems(sections);
  if (items.length === 0) return "";

  const bullets = items
    .map(
      (item) => `<li style="margin-bottom:8px;font-size:${EMAIL_TOKENS.body}px;color:${EMAIL_TOKENS.textPrimary};">
      <a href="${escapeHtml(item.url)}" style="color:${EMAIL_TOKENS.accent};font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
      <div style="font-style:italic;color:${EMAIL_TOKENS.textSecondary};font-size:${EMAIL_TOKENS.small}px;margin-top:2px;">${escapeHtml(item.whyThisMatters ?? "")}</div>
    </li>`,
    )
    .join("");

  return `<tr>
    <td style="padding:20px 24px 4px 24px;background:${EMAIL_TOKENS.urgentLight};border-left:4px solid ${EMAIL_TOKENS.urgent};">
      <div style="color:${EMAIL_TOKENS.urgent};font-weight:bold;font-size:${EMAIL_TOKENS.body}px;margin-bottom:8px;">⚑ PRIORITY</div>
      <ul style="margin:0;padding-left:20px;">${bullets}</ul>
    </td>
  </tr>`;
}

function renderSection(section: PersonalisedSection): string {
  const items = section.items.map(renderBulletItem).join("");
  const table = section.comparisonTable
    ? renderComparisonTable(section.comparisonTable)
    : "";

  return `<tr>
    <td style="padding:20px 24px 4px 24px;">
      <h2 style="color:${EMAIL_TOKENS.accent};font-size:${EMAIL_TOKENS.h2}px;font-weight:bold;border-bottom:1px solid ${EMAIL_TOKENS.border};padding-bottom:6px;margin:0 0 8px 0;">${escapeHtml(section.category)}</h2>
      <p style="color:${EMAIL_TOKENS.textSecondary};font-size:${EMAIL_TOKENS.body}px;margin:0 0 12px 0;">${escapeHtml(section.narrative)}</p>
      <ul style="margin:0;padding-left:20px;">${items}</ul>
      ${table}
    </td>
  </tr>`;
}

export function renderEmail(
  digest: PersonalisedDigest,
  runDate: string,
): string {
  const spotlightBlock = renderSpotlightBlock(digest.sections);
  const sectionsHtml = digest.sections.map(renderSection).join("");
  const headerDate = formatHeaderDate(runDate);
  const footerTimestamp = new Date(runDate).toISOString();

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:${EMAIL_TOKENS.background};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_TOKENS.background};">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${EMAIL_TOKENS.surface};">
            <tr>
              <td style="background:${EMAIL_TOKENS.accentDark};padding:20px 24px;">
                <h1 style="color:#FFFFFF;font-size:${EMAIL_TOKENS.h1}px;margin:0;">AI Digest — ${headerDate}</h1>
              </td>
            </tr>
            ${spotlightBlock}
            ${sectionsHtml}
            <tr>
              <td style="padding:16px 24px;color:${EMAIL_TOKENS.textMuted};font-size:${EMAIL_TOKENS.small}px;">
                Run completed ${footerTimestamp}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
