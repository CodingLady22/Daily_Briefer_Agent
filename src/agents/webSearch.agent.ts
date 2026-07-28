// Crawls curated sources for the last 24h of AI news and dedupes against recent digests.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { search } from "../tools/search.tool.js";
import { DigestRecord } from "../db/digest.model.js";
import { WEB_SEARCH_SYSTEM_PROMPT } from "./webSearch.prompt.js";
import type { DigestStateType } from "../graph/state.js";
import type { RawItem } from "../types/index.js";

const MAX_TOKENS = 8192;
const DEDUP_WINDOW_DAYS = 7;

// One targeted query per source from architecture.md, scoped to that domain.
// Benchmarks & Pricing sources are excluded — those belong to the Benchmark/Pricing agents.
const SOURCE_QUERIES: { domain: string; query: string }[] = [
  // Model releases & updates
  { domain: "huggingface.co", query: "new model release blog post" },
  { domain: "openai.com", query: "OpenAI news announcement" },
  { domain: "anthropic.com", query: "Anthropic news announcement" },
  { domain: "deepmind.google", query: "DeepMind blog announcement new model" },
  { domain: "mistral.ai", query: "Mistral AI news announcement" },
  // Frameworks & tooling
  { domain: "blog.langchain.dev", query: "LangChain blog update" },
  { domain: "changelog.langchain.com", query: "LangChain changelog release" },
  { domain: "weave-docs.wandb.ai", query: "Weave observability update" },
  { domain: "docs.arize.com", query: "Phoenix Arize observability update" },
  { domain: "guardrailsai.com", query: "Guardrails AI blog update" },
  // Research (applied filter)
  { domain: "arxiv.org", query: "new applied AI engineering research paper cs.AI" },
  { domain: "arxiv.org", query: "new applied NLP research paper cs.CL" },
  // Reliability / incidents
  { domain: "status.openai.com", query: "OpenAI status incident" },
  { domain: "status.anthropic.com", query: "Anthropic status incident" },
  { domain: "status.cloud.google.com", query: "Google Cloud status incident" },
  // Broader AI engineering news
  { domain: "latent.space", query: "Latent Space newsletter post" },
  { domain: "simonwillison.net", query: "Simon Willison blog post AI" },
];

// `publishedAt` is `.optional()` rather than `.nullable()` — Gemini's structured-output
// schema converter rejects a nullable string field ("Proto field is not repeating, cannot
// start list"). Optional is supported by all three providers; normalized to `null` below.
const CleanedItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  source: z.string(),
  summary: z.string(),
  publishedAt: z.string().optional(),
});

const CleanedItemsSchema = z.object({
  items: z.array(CleanedItemSchema),
});

// Reads the last 7 days of digests and collects every URL already covered,
// so a story that resurfaces mid-week doesn't get reported twice.
async function getSeenUrls(): Promise<Set<string>> {
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await DigestRecord.find({ date: { $gte: since } })
    .select("sourceUrls")
    .lean();
  return new Set(recent.flatMap((d) => d.sourceUrls));
}

// Runs the per-source Tavily queries, scoped to the last 24h via timeRange: "day".
// Never throws — a single source failing is logged and the rest still run.
async function fetchRawItems(): Promise<{ items: RawItem[]; errors: string[] }> {
  const errors: string[] = [];
  const batches = await Promise.all(
    SOURCE_QUERIES.map(async ({ domain, query }): Promise<RawItem[]> => {
      try {
        return await search(query, { timeRange: "day", includeDomains: [domain] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`WebSearch: ${domain} query failed: ${message}`);
        return [];
      }
    }),
  );
  return { items: batches.flat(), errors };
}

function dedupeByUrl(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export async function webSearchAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  const { items: rawBatches, errors: fetchErrors } = await fetchRawItems();
  const seenUrls = await getSeenUrls();
  const candidates = dedupeByUrl(rawBatches).filter((item) => !seenUrls.has(item.url));

  if (candidates.length === 0) {
    return { rawItems: [], errors: [...state.errors, ...fetchErrors] };
  }

  try {
    const llm = getLLM("cheap", MAX_TOKENS).withStructuredOutput(CleanedItemsSchema);
    const result = await llm.invoke([
      new SystemMessage(WEB_SEARCH_SYSTEM_PROMPT),
      new HumanMessage(JSON.stringify(candidates)),
    ]);
    const cleaned: RawItem[] = result.items.map(
      (item: z.infer<typeof CleanedItemSchema>) => ({
        ...item,
        publishedAt: item.publishedAt ?? null,
      }),
    );
    return { rawItems: cleaned, errors: [...state.errors, ...fetchErrors] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fall back to the raw, unclean items rather than losing the run's content entirely.
    return {
      rawItems: candidates,
      errors: [...state.errors, ...fetchErrors, `WebSearch: LLM extraction failed: ${message}`],
    };
  }
}
