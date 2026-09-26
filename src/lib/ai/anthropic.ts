import type { ToolSpec } from "../types";
import { describeError, readSse } from "./openai";
import {
  ProviderError,
  type AIProvider,
  type ChatMessage,
  type ChatStreamOptions,
  type ChatTurnOptions,
  type ProviderEvent,
} from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

type ContentBlock = Record<string, unknown>;

function splitSystem(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
}

/**
 * Anthropic takes tool calls and results as `content` blocks rather than as
 * separate messages: an assistant turn carries `tool_use`, and each result is a
 * `user` turn carrying `tool_result`.
 */
function toAnthropicMessages(messages: ChatMessage[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId ?? "",
            content: message.content,
          },
        ],
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      const blocks: ContentBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: safeParse(call.args),
        });
      }
      result.push({ role: "assistant", content: blocks });
      continue;
    }
    result.push({ role: message.role, content: message.content });
  }
  return result;
}

function toAnthropicTools(tools: ToolSpec[]): ContentBlock[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? { type: "object", properties: {} },
  }));
}

function safeParse(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return {};
  }
}

/** Anthropic's Messages API: `system` is a top-level field, not a message. */
export const anthropicProvider: AIProvider = {
  async *chatStream(options: ChatStreamOptions) {
    for await (const event of streamAnthropic({ ...options }, false)) {
      if (event.type === "text") yield event.text;
    }
  },

  async *streamTurn(options: ChatTurnOptions): AsyncGenerator<ProviderEvent> {
    yield* streamAnthropic(options, Boolean(options.tools?.length));
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

async function* streamAnthropic(
  { apiKey, baseUrl, model, messages, tools, signal }: ChatTurnOptions,
  withTools: boolean,
): AsyncGenerator<ProviderEvent> {
  const system = splitSystem(messages);
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
      max_tokens: MAX_TOKENS,
      stream: true,
      ...(system ? { system } : {}),
      messages: toAnthropicMessages(messages),
      ...(withTools && tools?.length ? { tools: toAnthropicTools(tools) } : {}),
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(await describeError(response), response.status);
  }

  /** Streaming tool inputs arrive as JSON fragments keyed by block index. */
  const pending = new Map<number, { id: string; name: string; json: string }>();
  let stopReason: string | undefined;

  for await (const payload of readSse(response.body)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue; // ping / non-JSON frame
    }

    const type = typeof parsed.type === "string" ? parsed.type : "";
    if (type === "content_block_start") {
      const block = parsed.content_block as
        | { type?: string; id?: string; name?: string }
        | undefined;
      if (block?.type === "tool_use") {
        pending.set(Number(parsed.index ?? 0), {
          id: block.id ?? "",
          name: block.name ?? "",
          json: "",
        });
      }
      continue;
    }
    if (type === "content_block_delta") {
      const delta = parsed.delta as
        | { type?: string; text?: string; partial_json?: string }
        | undefined;
      if (typeof delta?.text === "string" && delta.text) {
        yield { type: "text", text: delta.text };
      }
      if (typeof delta?.partial_json === "string") {
        const entry = pending.get(Number(parsed.index ?? 0));
        if (entry) entry.json += delta.partial_json;
      }
      continue;
    }
    if (type === "message_delta") {
      const delta = parsed.delta as { stop_reason?: string } | undefined;
      if (typeof delta?.stop_reason === "string") stopReason = delta.stop_reason;
      continue;
    }
    if (type === "error") {
      const error = parsed.error as { message?: string } | undefined;
      throw new ProviderError(
        `Provider error: ${error?.message ?? "unknown"}`,
      );
    }
  }

  for (const entry of [...pending.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)) {
    if (!entry.name) continue;
    yield { type: "tool_call", id: entry.id, name: entry.name, args: entry.json };
  }
  yield { type: "done", stopReason };
}
