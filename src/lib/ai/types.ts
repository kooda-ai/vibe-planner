export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStreamOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
  /** Aborts the underlying fetch when the client disconnects. */
  signal?: AbortSignal;
}

/**
 * Common surface every AI provider adapter implements. Streaming differences
 * (SSE shapes, delta formats) are normalised to plain text chunks here so the
 * route handler and the UI stay provider-agnostic.
 */
export interface AIProvider {
  /** Yields incremental text chunks of the assistant answer. */
  chatStream(options: ChatStreamOptions): AsyncGenerator<string, void, unknown>;
  /** Lists the models the provider exposes; empty array when unsupported. */
  listModels(options: { apiKey: string; baseUrl?: string }): Promise<string[]>;
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
