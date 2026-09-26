import type { ToolSpec } from "../types";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant messages that requested tools carry the calls here. */
  toolCalls?: ToolCall[];
  /** `tool` messages: which call they answer. */
  toolCallId?: string;
  /** `tool` messages: the tool's name, when the provider wants it. */
  name?: string;
  /**
   * Adapter-private payload echoed back on the next turn. The Codex Responses
   * API expects the assistant's raw output items (reasoning + function_call) to
   * be replayed verbatim, so the adapter stashes them here; other adapters
   * ignore the field.
   */
  providerItems?: unknown[];
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string of the arguments, as produced by the model. */
  args: string;
}

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
  /** Codex only: the ChatGPT account id sent as `ChatGPT-Account-Id`. */
  accountId?: string;
}

export interface ChatStreamOptions extends ProviderCredentials {
  model: string;
  messages: ChatMessage[];
  /** Aborts the underlying fetch when the client disconnects. */
  signal?: AbortSignal;
}

export interface ChatTurnOptions extends ChatStreamOptions {
  /** Tools the model may call this turn; omitted when there are none. */
  tools?: ToolSpec[];
}

/**
 * Structured stream event. Text chunks are forwarded to the viewer as they
 * arrive; a `tool_call` means the model wants a tool run before it continues.
 */
export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: string }
  | { type: "done"; stopReason?: string; providerItems?: unknown[] };

/**
 * Common surface every AI provider adapter implements.
 *
 * `chatStream` yields plain text and stays the simple path (and the fallback
 * for endpoints that reject tool definitions). `streamTurn` is optional and
 * carries the richer event vocabulary the agent loop needs; an adapter without
 * it is wrapped by the agent so tools are simply unavailable.
 */
export interface AIProvider {
  /** Yields incremental text chunks of the assistant answer. */
  chatStream(options: ChatStreamOptions): AsyncGenerator<string, void, unknown>;
  /** Yields text + tool-call events; only implemented where supported. */
  streamTurn?(options: ChatTurnOptions): AsyncGenerator<ProviderEvent, void, unknown>;
  /** Lists the models the provider exposes; empty array when unsupported. */
  listModels(options: ProviderCredentials): Promise<string[]>;
}

/** Raised for provider-side failures so routes can return a readable message. */
export class ProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
