import { readSse } from "./openai";
import {
  CODEX_CLIENT_VERSIONS,
  ORIGINATOR,
  extractCodexModelRecords,
  modelsEndpoint,
  responsesEndpoint,
  selectCodexModels,
} from "./codex-oauth";
import {
  ProviderError,
  type AIProvider,
  type ChatMessage,
  type ChatStreamOptions,
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
 * The flow is unofficial; if OpenAI changes it, this file is the place to fix.
 */

interface ResponsesInputItem {
  role: "user" | "assistant";
  content: string;
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

  const input: ResponsesInputItem[] = messages
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } =>
      message.role !== "system",
    )
    .map((message) => ({ role: message.role, content: message.content }));

  return { instructions, input };
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
  async *chatStream({
    apiKey,
    model,
    messages,
    accountId,
    signal,
  }: ChatStreamOptions) {
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
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(await describeError(response), response.status);
    }

    for await (const payload of readSse(response.body)) {
      if (payload === "[DONE]") return;
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
        if (typeof delta === "string" && delta) yield delta;
        continue;
      }
      if (type === "response.completed" || type === "response.done") return;
    }
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
