// Scrapes provider pricing pages and diffs prices against the last MongoDB snapshot.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { pricingScraperTool } from "../tools/pricingScraper.tool.js";
import { PricingSnapshot } from "../db/pricingSnapshot.model.js";
import { PRICING_SYSTEM_PROMPT } from "./pricing.prompt.js";
import type { DigestStateType } from "../graph/state.js";
import type { PricingDelta, PricingEntry, PricingProvider } from "../types/index.js";

const MAX_TOKENS = 4096;
const MIN_SNAPSHOT_ITEMS = 5;

const PricingEntrySchema = z.object({
  modelName: z.string(),
  provider: z.enum(["openai", "anthropic", "google"]),
  inputPer1M: z.number(),
  outputPer1M: z.number(),
  source: z.string().url(),
});

const PricingEntriesSchema = z.object({
  prices: z.array(PricingEntrySchema),
});

function priceKey(modelName: string, provider: PricingProvider): string {
  return `${modelName}::${provider}`;
}

// Cross-citing sources (e.g. a search fallback quoting the same price as a direct fetch)
// can yield the same model+provider pair more than once. Sort by source first so
// collapsing to one row per key is deterministic — last write (alphabetically last source) wins.
function dedupePrices(prices: PricingEntry[]): PricingEntry[] {
  const sorted = [...prices].sort((a, b) => a.source.localeCompare(b.source));
  const byKey = new Map<string, PricingEntry>();
  for (const price of sorted) {
    byKey.set(priceKey(price.modelName, price.provider), price);
  }
  return [...byKey.values()];
}

// Diffs current prices against the previous snapshot, per model per provider. Unlike
// Benchmark deltas there is no significance threshold — price moves are rare, so any
// actual change from a known previous price is flagged (project-overview.md).
function calculateDeltas(
  currentPrices: PricingEntry[],
  previousPrices: PricingEntry[],
): PricingDelta[] {
  const previousByKey = new Map<string, PricingEntry>();
  for (const prev of previousPrices) {
    previousByKey.set(priceKey(prev.modelName, prev.provider), prev);
  }

  return currentPrices.map((current) => {
    const previous = previousByKey.get(priceKey(current.modelName, current.provider)) ?? null;
    const significant =
      previous !== null &&
      (previous.inputPer1M !== current.inputPer1M ||
        previous.outputPer1M !== current.outputPer1M);
    return {
      modelName: current.modelName,
      provider: current.provider,
      oldInputPer1M: previous?.inputPer1M ?? null,
      newInputPer1M: current.inputPer1M,
      oldOutputPer1M: previous?.outputPer1M ?? null,
      newOutputPer1M: current.outputPer1M,
      significant,
      source: current.source,
    };
  });
}

export async function pricingAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  try {
    const { items: rawItems, errors: scraperErrors } = await pricingScraperTool();

    const llm = getLLM("cheap", MAX_TOKENS).withStructuredOutput(PricingEntriesSchema);
    const extracted = await llm.invoke([
      new SystemMessage(PRICING_SYSTEM_PROMPT),
      new HumanMessage(JSON.stringify(rawItems)),
    ]);
    const currentPrices = dedupePrices(extracted.prices);

    const previousSnapshot = await PricingSnapshot.findOne().sort({ date: -1 }).lean();
    const previousPrices: PricingEntry[] = previousSnapshot?.prices ?? [];

    const pricingDeltas = calculateDeltas(currentPrices, previousPrices);

    if (currentPrices.length < MIN_SNAPSHOT_ITEMS) {
      // A bad scrape must never destroy the diff history — skip the write and
      // keep the previous snapshot as tomorrow's baseline.
      return {
        pricingDeltas,
        errors: [
          ...scraperErrors,
          `Pricing: low-yield extraction (${currentPrices.length} items), snapshot not saved`,
        ],
      };
    }

    // Save before the run ends so tomorrow's run has something to diff against.
    await PricingSnapshot.create({
      date: new Date(state.runDate),
      prices: currentPrices,
    });

    return { pricingDeltas, errors: scraperErrors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`Pricing: ${message}`] };
  }
}
