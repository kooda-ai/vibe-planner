import { describeError, readSse } from "./openai";
import {
  ProviderError,
  type AIProvider,
  type ChatStreamOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

/** Anthropic's Messages API: `system` is a top-level field, not a message. */
export const anthropicProvider: AIProvider = {
  async *chatStream({ apiKey, baseUrl, model, messages, signal }: ChatStreamOptions) {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        ...(system ? { system } : {}),
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role, content: message.content })),
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(await describeError(response), response.status);
    }

    for await (const payload of readSse(response.body)) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed?.type === "content_block_delta") {
          const text = parsed?.delta?.text;
          if (typeof text === "string" && text) yield text;
        }
        if (parsed?.type === "error") {
          throw new ProviderError(
            `Provider error: ${parsed?.error?.message ?? "unknown"}`,
          );
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        // Ignore ping / non-JSON frames.
      }
    }
  },

  async listModels({ apiKey, baseUrl }) {
    const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/models`;
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION },
    });
    if (!response.ok) {
      throw new ProviderError(await describeError(response), response.status);
    }
    const data = (await response.json()) as { data?: { id?: string }[] };
    return (data.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort();
  },
};
