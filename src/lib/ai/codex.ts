import type { ToolSpec } from "../types";
import {
  CODEX_CLIENT_VERSIONS,
  ORIGINATOR,
  extractCodexModelRecords,
  modelsEndpoint,
  responsesEndpoint,
  selectCodexModels,
} from "./codex-oauth";
import { readSse } from "./openai";
import {
  ProviderError,
  type AIProvider,
  type ChatMessage,
  type ChatStreamOptions,
  type ChatTurnOptions,
  type ProviderEvent,
} from "./types";

/**
 * Adapter for the ChatGPT backend that a Codex login unlocks.
 *
 * Unlike the other adapters this one speaks the **Responses API**
 * (`/backend-api/codex/responses`), not Chat Completions, and it streams a
 * different SSE vocabulary (`response.output_text.delta`,
 * `response.completed`, …). Both differences are normalised here so the rest of
 * the app keeps consuming plain text chunks.
 *
 * Tool calls use the Responses item types `function_call` /
 * `function_call_output`, and the assistant's raw output items have to be sent
 * back on the next turn — `providerItems` does that.
 *
 * The flow is unofficial; if OpenAI changes it, this file is the place to fix.
 */

interface ResponsesInputItem {
  role?: "user" | "assistant";
  content?: string;
  type?: string;
  [key: string]: unknown;
}

/** Maps the app's chat messages onto a Responses API request body. */
function buildResponseInput(messages: ChatMessage[]): {
  instructions: string;
  input: ResponsesInputItem[];
} {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const input: ResponsesInputItem[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? "",
        output: message.content,
      });
      continue;
    }
    if (message.role === "assistant") {
      // Replay the stored output items (reasoning + function_call) verbatim;
      // the backend rejects a function_call_output whose matching call is
      // missing from the conversation.
      if (message.providerItems?.length) {
        input.push(...(message.providerItems as ResponsesInputItem[]));
        continue;
      }
      input.push({ role: "assistant", content: message.content });
      continue;
    }
    input.push({ role: "user", content: message.content });
  }

  return { instructions, input };
}

function toCodexTools(tools: ToolSpec[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? { type: "object", properties: {} },
  }));
}

function describeSseError(parsed: Record<string, unknown>): string | null {
  const error = parsed.error as { message?: string } | undefined;
  if (error?.message) return error.message;
  if (parsed.type === "response.failed") {
    const response = parsed.response as
      | { error?: { message?: string } }
      | undefined;
    return response?.error?.message ?? "The ChatGPT backend reported a failure.";
  }
  return null;
}

export const codexProvider: AIProvider = {
  async *chatStream(options: ChatStreamOptions) {
    for await (const event of streamCodex({ ...options }, false)) {
      if (event.type === "text") yield event.text;
    }
  },

  async *streamTurn(options: ChatTurnOptions): AsyncGenerator<ProviderEvent> {
    yield* streamCodex(options, Boolean(options.tools?.length));
  },

  async listModels({ apiKey, accountId }) {
    // The Codex backend serves its own catalogue; the account must be resolved
    // first because the endpoint is host-dependent (EU accounts differ).
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      originator: ORIGINATOR,
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    };

    let best: string[] = [];
    let lastError: ProviderError | undefined;

    // The catalogue is version-gated and returns a *shorter* list (not an
    // error) for a client that looks too old, so every candidate version is
    // queried and the richest answer wins.
    for (const clientVersion of CODEX_CLIENT_VERSIONS) {
      try {
        const response = await fetch(modelsEndpoint(apiKey, clientVersion), {
          headers,
        });
        if (!response.ok) {
          lastError = new ProviderError(
            await describeError(response),
            response.status,
          );
          continue;
        }
        const found = selectCodexModels(
          extractCodexModelRecords(await response.json()),
        ).map((model) => model.slug);
        if (found.length > best.length) best = found;
      } catch (error) {
        lastError =
          error instanceof ProviderError
            ? error
            : new ProviderError(
                error instanceof Error ? error.message : "unknown_error",
              );
      }
    }

    if (!best.length) {
      throw (
        lastError ??
        new ProviderError(
          "The Codex backend returned no models for this ChatGPT account.",
        )
      );
    }
    return best;
  },
};

async function* streamCodex(
  { apiKey, model, messages, tools, accountId, signal }: ChatTurnOptions,
  withTools: boolean,
): AsyncGenerator<ProviderEvent> {
  const { instructions, input } = buildResponseInput(messages);

  const response = await fetch(responsesEndpoint(apiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      originator: ORIGINATOR,
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      stream: true,
      store: false,
      ...(withTools && tools?.length
        ? { tools: toCodexTools(tools), tool_choice: "auto" }
        : {}),
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(await describeError(response), response.status);
  }

  /** Output items collected so the adapter can replay them on the next turn. */
  const items: unknown[] = [];

  for await (const payload of readSse(response.body)) {
    if (payload === "[DONE]") break;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue; // keep-alive / non-JSON frame
    }

    const failure = describeSseError(parsed);
    if (failure) throw new ProviderError(failure);

    const type = typeof parsed.type === "string" ? parsed.type : "";
    if (type === "response.output_text.delta") {
      const delta = parsed.delta;
      if (typeof delta === "string" && delta) yield { type: "text", text: delta };
      continue;
    }
    if (type === "response.output_item.done") {
      const item = parsed.item as Record<string, unknown> | undefined;
      if (!item) continue;
      items.push(item);
      if (item.type === "function_call") {
        yield {
          type: "tool_call",
          id: String(item.call_id ?? ""),
          name: String(item.name ?? ""),
          args: String(item.arguments ?? ""),
        };
      }
      continue;
    }
    if (type === "response.completed" || type === "response.done") {
      const responseData = parsed.response as
        | { output?: unknown[]; stop_reason?: string; status?: string }
        | undefined;
      const output = responseData?.output;
      if (Array.isArray(output) && output.length) items.splice(0, items.length, ...output);
      yield {
        type: "done",
        stopReason: responseData?.status ?? responseData?.stop_reason,
        providerItems: items,
      };
      return;
    }
  }

  yield { type: "done", providerItems: items };
}

async function describeError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `Provider error (${response.status})`;
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string };
        detail?: string;
      };
      const message =
        parsed?.error?.message ?? parsed?.detail ?? JSON.stringify(parsed);
      return `Provider error (${response.status}): ${message}`;
    } catch {
      return `Provider error (${response.status}): ${text.slice(0, 400)}`;
    }
  } catch {
    return `Provider error (${response.status})`;
  }
}
