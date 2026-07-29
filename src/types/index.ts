// Shared TypeScript types used across agents, tools, and the graph state.

export type RawItem = {
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt: string | null;
};

export type BenchmarkScore = {
  modelName: string;
  benchmark: string;
  score: number;
  source: string;
};

export type BenchmarkDelta = {
  modelName: string;
  benchmark: string;
  previousScore: number | null;
  currentScore: number;
  delta: number | null;
  significant: boolean;
  source: string;
};

export type PricingProvider = "openai" | "anthropic" | "google";

export type PricingEntry = {
  modelName: string;
  provider: PricingProvider;
  inputPer1M: number;
  outputPer1M: number;
  source: string;
};

export type PricingDelta = {
  modelName: string;
  provider: PricingProvider;
  oldInputPer1M: number | null;
  newInputPer1M: number;
  oldOutputPer1M: number | null;
  newOutputPer1M: number;
  significant: boolean;
  source: string;
};

export type ComparisonTable = {
  headers: string[];
  rows: string[][];
};

export type DigestItem = {
  title: string;
  url: string;
  summary: string;
  source: string;
};

export type DigestSection = {
  category: string;
  narrative: string;
  items: DigestItem[];
  comparisonTable: ComparisonTable | null;
};

export type PersonalisedItem = DigestItem & {
  priority: boolean;
  whyThisMatters: string | null;
};

export type PersonalisedSection = {
  category: string;
  narrative: string;
  items: PersonalisedItem[];
  comparisonTable: ComparisonTable | null;
};

export type PersonalisedDigest = {
  sections: PersonalisedSection[];
};

export type EmailPayload = {
  subject: string;
  html: string;
};
