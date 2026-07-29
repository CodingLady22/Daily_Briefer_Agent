// Wraps the Tavily search API for sources that can't be scraped directly (JS-rendered pages).
import { TavilySearch } from "@langchain/tavily";
import { config } from "../config/index.js";
import type { RawItem } from "../types/index.js";

const tavily = new TavilySearch({
  tavilyApiKey: config.tavilyApiKey,
  maxResults: 5,
});

export type SearchOptions = {
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
};

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<RawItem[]> {
  const response = await tavily.invoke({ query, ...options });
  if ("error" in response) {
    return []; // Tavily returned an error payload instead of results
  }
  const items: RawItem[] = [];
  for (const r of response.results as { title: string; url: string; content: string }[]) {
    // Tavily occasionally returns a relative redirect URL (e.g. "/goto?url=...")
    // instead of an absolute one. It can't be cited as a source, so skip it.
    try {
      const source = new URL(r.url).hostname;
      items.push({
        title: r.title,
        url: r.url,
        source,
        summary: r.content,
        publishedAt: null, // Tavily does not return a publish date on search results
      });
    } catch {
      continue;
    }
  }
  return items;
}
