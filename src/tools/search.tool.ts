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
  return response.results.map((r: { title: string; url: string; content: string }) => ({
    title: r.title,
    url: r.url,
    source: new URL(r.url).hostname,
    summary: r.content,
    publishedAt: null, // Tavily does not return a publish date on search results
  }));
}
