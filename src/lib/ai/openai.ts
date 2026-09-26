import type { ToolSpec } from "../types";
import {
  ProviderError,
  type AIProvider,
  type ChatMessage,
  type ChatStreamOptions,
  type ChatTurnOptions,
  type ProviderEvent,
  type ToolCall,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAIToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** Builds the `messages` array Chat Completions expects, tool calls included. */
function toOpenAIMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? "",
        content: message.content,
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.args },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAITools(tools: ToolSpec[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

/**
 * Accumulates streamed `tool_calls` deltas. OpenAI sends the name in one chunk
 * and the JSON arguments across many, indexed by `index`, so they are merged
 * until the stream ends.
 */
class ToolCallAccumulator {
  private calls = new Map<number, ToolCall>();

  push(deltas: OpenAIToolCallDelta[]): void {
    for (const delta of deltas) {
      const index = delta.index ?? 0;
      const current = this.calls.get(index) ?? { id: "", name: "", args: "" };
      this.calls.set(index, {
        id: delta.id ?? current.id,
        name: delta.function?.name ?? current.name,
        args: current.args + (delta.function?.arguments ?? ""),
      });
    }
  }

  list(): ToolCall[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => call)
      .filter((call) => Boolean(call.name));
  }
}

/** OpenAI plus any OpenAI-compatible endpoint (via a custom base URL). */
export const openAIProvider: AIProvider = {
  async *chatStream(options: ChatStreamOptions) {
    for await (const event of streamOpenAI(options, false)) {
      if (event.type === "text") yield event.text;
    }
  },

  async *streamTurn(options: ChatTurnOptions): AsyncGenerator<ProviderEvent> {
    const hasTools = Boolean(options.tools?.length);
    for await (const event of streamOpenAI(options, hasTools)) {
      yield event;
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

/**
 * Shared Chat Completions streaming loop. `withTools` adds the tool definitions
 * to the request; an endpoint that does not understand them answers with an
 * error and the caller can retry without tools.
 */
async function* streamOpenAI(
  { apiKey, baseUrl, model, messages, tools, signal }: ChatTurnOptions,
  withTools: boolean,
): AsyncGenerator<ProviderEvent> {
  const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: toOpenAIMessages(messages),
      stream: true,
      ...(withTools && tools?.length ? { tools: toOpenAITools(tools) } : {}),
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(await describeError(response), response.status);
  }

  const accumulator = new ToolCallAccumulator();
  let stopReason: string | undefined;

  for await (const payload of readSse(response.body)) {
    if (payload === "[DONE]") break;
    try {
      const parsed = JSON.parse(payload);
      const choice = parsed?.choices?.[0];
      const delta: unknown = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        yield { type: "text", text: delta };
      }
      const toolDeltas = choice?.delta?.tool_calls;
      if (Array.isArray(toolDeltas)) accumulator.push(toolDeltas);
      if (typeof choice?.finish_reason === "string") {
        stopReason = choice.finish_reason;
      }
    } catch {
      // Ignore keep-alive / non-JSON SSE frames.
    }
  }

  for (const call of accumulator.list()) {
    yield { type: "tool_call", id: call.id, name: call.name, args: call.args };
  }
  yield { type: "done", stopReason };
}

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
