// Reorders sections for the user's stack and flags priority items with "why this matters" notes.
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/index.js";
import { PERSONALIZATION_SYSTEM_PROMPT } from "./personalization.prompt.js";
import { CATEGORIES } from "./synthesis.agent.js";
import type { DigestStateType } from "../graph/state.js";
import type { DigestSection, PersonalisedItem, PersonalisedSection } from "../types/index.js";

const MAX_TOKENS = 4096;

// The LLM only judges relevance and orders — it refers to items by their exact
// original url and never re-emits title/summary/source, so content can't drift.
const PersonalisedItemAnnotationSchema = z.object({
  url: z.string().url(),
  priority: z.boolean(),
  whyThisMatters: z.string().optional(),
});

const PersonalisedSectionOrderSchema = z.object({
  category: z.enum(CATEGORIES),
  items: z.array(PersonalisedItemAnnotationSchema),
});

const PersonalisedDigestOrderSchema = z.object({
  sections: z.array(PersonalisedSectionOrderSchema),
});

function undecorated(section: DigestSection): PersonalisedSection {
  return {
    category: section.category,
    narrative: section.narrative,
    items: section.items.map((item) => ({ ...item, priority: false, whyThisMatters: null })),
    comparisonTable: section.comparisonTable,
  };
}

export async function personalizationAgent(
  state: DigestStateType,
): Promise<Partial<DigestStateType>> {
  const { sections } = state;

  if (sections.length === 0) {
    return { personalisedDigest: { sections: [] } };
  }

  try {
    const llm = getLLM("premium", MAX_TOKENS).withStructuredOutput(PersonalisedDigestOrderSchema);
    const result = await llm.invoke([
      new SystemMessage(PERSONALIZATION_SYSTEM_PROMPT),
      new HumanMessage(
        JSON.stringify({
          sections: sections.map((section) => ({
            category: section.category,
            items: section.items.map((item) => ({
              title: item.title,
              url: item.url,
              summary: item.summary,
              source: item.source,
            })),
          })),
        }),
      ),
    ]);

    const originalByCategory = new Map(sections.map((s) => [s.category, s]));
    const usedCategories = new Set<string>();
    const orderedSections: PersonalisedSection[] = [];

    for (const llmSection of result.sections) {
      const original = originalByCategory.get(llmSection.category);
      if (!original) continue; // category not in input — ignore, never invent one
      usedCategories.add(llmSection.category);

      const itemsByUrl = new Map(original.items.map((i) => [i.url, i]));
      const usedUrls = new Set<string>();
      const items: PersonalisedItem[] = [];

      for (const annotated of llmSection.items) {
        const item = itemsByUrl.get(annotated.url);
        if (!item) continue; // url not in this section's input — ignore
        usedUrls.add(annotated.url);
        items.push({
          ...item,
          priority: annotated.priority,
          whyThisMatters: annotated.whyThisMatters ?? null,
        });
      }

      // Items the LLM left out are appended, not dropped — every item must survive.
      for (const item of original.items) {
        if (!usedUrls.has(item.url)) {
          items.push({ ...item, priority: false, whyThisMatters: null });
        }
      }

      orderedSections.push({
        category: original.category,
        narrative: original.narrative,
        items,
        comparisonTable: original.comparisonTable,
      });
    }

    // Sections the LLM left out are appended, not dropped, in their original order.
    for (const original of sections) {
      if (!usedCategories.has(original.category)) {
        orderedSections.push(undecorated(original));
      }
    }

    return { personalisedDigest: { sections: orderedSections } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`Personalization: ${message}`] };
  }
}
