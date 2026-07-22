// Loads and validates all environment variables. The only file in the
// project allowed to read from `process.env` directly.
import "dotenv/config";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const envSchema = z
  .object({
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    LLM_PROVIDER: z.enum(["gemini", "openai", "anthropic"]),
    LLM_MODEL_CHEAP: z.string().min(1, "LLM_MODEL_CHEAP is required"),
    LLM_MODEL_PREMIUM: z.string().min(1, "LLM_MODEL_PREMIUM is required"),
    GEMINI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY is required"),
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    RESEND_FROM: z.string().min(1, "RESEND_FROM is required"),
    DIGEST_TO_EMAIL: z.string().email("DIGEST_TO_EMAIL must be a valid email"),
    CRON_TIMEZONE: z.string().default("Europe/Rome"),
  })
  .refine(
    (env) => {
      if (env.LLM_PROVIDER === "gemini") return Boolean(env.GEMINI_API_KEY);
      if (env.LLM_PROVIDER === "openai") return Boolean(env.OPENAI_API_KEY);
      return Boolean(env.ANTHROPIC_API_KEY);
    },
    { message: "API key for the selected LLM_PROVIDER is missing" },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.message}`,
  );
}

const env = parsed.data;

export const config = {
  mongodbUri: env.MONGODB_URI,
  llmProvider: env.LLM_PROVIDER,
  llmModelCheap: env.LLM_MODEL_CHEAP,
  llmModelPremium: env.LLM_MODEL_PREMIUM,
  geminiApiKey: env.GEMINI_API_KEY,
  openaiApiKey: env.OPENAI_API_KEY,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  tavilyApiKey: env.TAVILY_API_KEY,
  resendApiKey: env.RESEND_API_KEY,
  resendFrom: env.RESEND_FROM,
  digestToEmail: env.DIGEST_TO_EMAIL,
  cronTimezone: env.CRON_TIMEZONE,
} as const;

export type LlmTier = "cheap" | "premium";

// Picks the configured provider and the model for the requested cost tier.
// WebSearch/Benchmark/Pricing use "cheap"; Synthesis/Personalization use "premium".
export function getLLM(tier: LlmTier): BaseChatModel {
  const model = tier === "cheap" ? config.llmModelCheap : config.llmModelPremium;

  switch (config.llmProvider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({ model, apiKey: config.geminiApiKey });
    case "openai":
      return new ChatOpenAI({ model, apiKey: config.openaiApiKey });
    case "anthropic":
      return new ChatAnthropic({ model, apiKey: config.anthropicApiKey });
    default:
      throw new Error(`Unknown LLM provider: ${config.llmProvider as string}`);
  }
}
