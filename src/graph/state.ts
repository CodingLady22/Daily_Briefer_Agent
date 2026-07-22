// Shared LangGraph state annotation threaded through every agent node.
import { Annotation } from "@langchain/langgraph";
import type {
  RawItem,
  BenchmarkDelta,
  PricingDelta,
  DigestSection,
  PersonalisedDigest,
  EmailPayload,
} from "../types/index.js";

export const DigestState = Annotation.Root({
  rawItems: Annotation<RawItem[]>({
    reducer: (_curr, next) => next,
    default: () => [],
  }),
  benchmarkDeltas: Annotation<BenchmarkDelta[]>({
    reducer: (_curr, next) => next,
    default: () => [],
  }),
  pricingDeltas: Annotation<PricingDelta[]>({
    reducer: (_curr, next) => next,
    default: () => [],
  }),
  sections: Annotation<DigestSection[]>({
    reducer: (_curr, next) => next,
    default: () => [],
  }),
  personalisedDigest: Annotation<PersonalisedDigest | null>({
    reducer: (_curr, next) => next,
    default: () => null,
  }),
  emailPayload: Annotation<EmailPayload | null>({
    reducer: (_curr, next) => next,
    default: () => null,
  }),
  errors: Annotation<string[]>({
    reducer: (curr, next) => [...curr, ...next],
    default: () => [],
  }),
  runDate: Annotation<string>({
    reducer: (_curr, next) => next,
    default: () => new Date().toISOString(),
  }),
});

export type DigestStateType = typeof DigestState.State;
