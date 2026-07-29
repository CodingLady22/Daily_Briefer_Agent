// Groups raw items and deltas into narrated, source-cited digest sections.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { SYNTHESIS_SYSTEM_PROMPT } from "./synthesis.prompt.js";
import type { DigestStateType } from "../graph/state.js";
import type { DigestSection } from "../types/index.js";

const MAX_TOKENS = 8192;

export const CATEGORIES = [
  "Model releases & updates",
  "Benchmark movements",
  "Framework & tooling news",
  "Research papers",
  "Pricing & rate limit changes",
  "Reliability incidents",
] as const;

const DigestItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  summary: z.string(),
  source: z.string(),
});

const ComparisonTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

// `comparisonTable` is `.optional()`, not `.nullable()` — Gemini's structured-output
// schema converter rejects nullable fields. Normalized to `null` below.
const DigestSectionSchema = z.object({
  category: z.enum(CATEGORIES),
  narrative: z.string(),
  items: z.array(DigestItemSchema),
  comparisonTable: ComparisonTableSchema.optional(),
});

const DigestSectionsSchema = z.object({
  sections: z.array(DigestSectionSchema),
});

export async function synthesisAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  const { rawItems, benchmarkDeltas, pricingDeltas } = state;

  if (rawItems.length === 0 && benchmarkDeltas.length === 0 && pricingDeltas.length === 0) {
    return { sections: [] };
  }

  try {
    const llm = getLLM("premium", MAX_TOKENS).withStructuredOutput(DigestSectionsSchema);
    const result = await llm.invoke([
      new SystemMessage(SYNTHESIS_SYSTEM_PROMPT),
      new HumanMessage(JSON.stringify({ rawItems, benchmarkDeltas, pricingDeltas })),
    ]);

    // Defensive filter in addition to the prompt's own instruction — an empty
    // section carries no citations and adds nothing to the digest.
    const sections: DigestSection[] = result.sections
      .filter((section: z.infer<typeof DigestSectionSchema>) => section.items.length > 0)
      .map((section: z.infer<typeof DigestSectionSchema>) => ({
        category: section.category,
        narrative: section.narrative,
        items: section.items,
        comparisonTable: section.comparisonTable ?? null,
      }));

    return { sections };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`Synthesis: ${message}`] };
  }
}
