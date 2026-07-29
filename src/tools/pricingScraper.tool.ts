// Gathers raw pricing-page material for the Pricing agent to extract prices from.
// Tries a direct fetch first (some pricing pages are static); falls back to search when the
// page comes back empty or too short to be useful, which signals a JS-rendered shell (see
// library-docs.md). The Pricing agent (Phase 4.3) extracts structured
// { modelName, provider, inputPer1M, outputPer1M, source } prices from the returned text.
import { webFetch } from "./webFetch.tool.js";
import { search } from "./search.tool.js";
import type { RawItem } from "../types/index.js";

const MIN_USABLE_TEXT_LENGTH = 200;

const PRICING_SOURCES: { url: string; provider: string }[] = [
  { url: "https://openai.com/api/pricing", provider: "openai" },
  { url: "https://www.anthropic.com/pricing", provider: "anthropic" },
  { url: "https://ai.google.dev/pricing", provider: "google" },
];

export type PricingScraperResult = {
  items: RawItem[];
  errors: string[];
};

// Promise.allSettled — one source failing must not discard the other two providers' results.
export async function pricingScraperTool(): Promise<PricingScraperResult> {
  const settled = await Promise.allSettled(
    PRICING_SOURCES.map(
      async ({ url, provider }): Promise<{ items: RawItem[]; droppedCount: number }> => {
        const text = await webFetch(url);
        if (text !== null && text.length >= MIN_USABLE_TEXT_LENGTH) {
          return {
            items: [
              {
                title: `${provider} pricing`,
                url,
                source: new URL(url).hostname,
                summary: text,
                publishedAt: null,
              },
            ],
            droppedCount: 0,
          };
        }
        return search(`${provider} API pricing per 1M tokens`);
      },
    ),
  );

  const items: RawItem[] = [];
  const errors: string[] = [];

  settled.forEach((result, i) => {
    const { provider } = PRICING_SOURCES[i];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      if (result.value.droppedCount > 0) {
        errors.push(`search: skipped ${result.value.droppedCount} unparseable URLs (${provider})`);
      }
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`pricingScraper: ${provider} failed - ${reason}`);
    }
  });

  return { items, errors };
}
