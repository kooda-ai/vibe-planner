import {
  ProviderError,
  type AIProvider,
  type ChatStreamOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** OpenAI plus any OpenAI-compatible endpoint (via a custom base URL). */
export const openAIProvider: AIProvider = {
  async *chatStream({ apiKey, baseUrl, model, messages, signal }: ChatStreamOptions) {
    const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(await describeError(response), response.status);
    }

    for await (const payload of readSse(response.body)) {
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        const delta: unknown = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // Ignore keep-alive / non-JSON SSE frames.
      }
    }
  },

  async listModels({ apiKey, baseUrl }) {
    const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/models`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}` },
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

/** Yields each SSE `data:` payload from a byte stream. */
export async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          yield line.slice(5).trim();
        }
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

export async function describeError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `Provider error (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      const message =
        parsed?.error?.message ?? parsed?.message ?? JSON.stringify(parsed);
      return `Provider error (${response.status}): ${message}`;
    } catch {
      return `Provider error (${response.status}): ${text.slice(0, 400)}`;
    }
  } catch {
    return `Provider error (${response.status})`;
  }
}
