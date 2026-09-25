import { anthropicProvider } from "./anthropic";
import { codexProvider } from "./codex";
import { openAIProvider } from "./openai";
import type { AIProvider } from "./types";
import type { ProviderType } from "../types";

const REGISTRY: Record<ProviderType, AIProvider> = {
  openai: openAIProvider,
  "openai-compatible": openAIProvider,
  anthropic: anthropicProvider,
  "openai-codex": codexProvider,
};

export function getProvider(type: ProviderType): AIProvider {
  return REGISTRY[type] ?? openAIProvider;
}

export * from "./types";
