import type { MCPServerConfig } from "../types";
import { callServerTool } from "../mcp/client";
import { waitForApproval } from "../mcp/approvals";
import {
  parseToolArgs,
  toToolSpecs,
  truncateToolResult,
  type NamespacedTool,
} from "../mcp/tools";
import { visiblePrefix } from "../plan-block";
import {
  type AIProvider,
  type ChatMessage,
  type ChatStreamOptions,
  type ProviderEvent,
} from "./types";

/** Maximum provider round-trips in one turn, so a tool loop cannot run away. */
export const MAX_AGENT_TURNS = 8;

/**
 * Events the agent produces. `delta` carries user-visible prose (already
 * stripped of the hidden plan block); everything else drives the transient
 * "tool activity" display. None of it is persisted.
 */
export type AgentEvent =
  | { type: "delta"; text: string }
  /** Full raw answer (hidden plan block included), emitted once at the end. */
  | { type: "final"; text: string }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      toolName: string;
      serverName: string;
      args: string;
    }
  | {
      type: "tool_approval_required";
      callId: string;
      name: string;
      toolName: string;
      serverName: string;
      args: string;
    }
  | { type: "tool_approval_resolved"; callId: string; approved: boolean }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      ok: boolean;
      summary: string;
    };

export interface AgentTurnOptions {
  provider: AIProvider;
  /** Credentials, model, project messages and abort signal. */
  streamOptions: ChatStreamOptions;
  /** Namespaced MCP tools (empty when no server has tools). */
  tools: NamespacedTool[];
  servers: MCPServerConfig[];
  /** Namespaced tool names allowed to run without asking. */
  autoApproved: Set<string>;
  /** Called with the full raw answer once the turn finishes. */
  signal?: AbortSignal;
}

/**
 * Runs the agent loop: streams the model's answer, executes MCP tools when it
 * asks for them (after an approval round-trip when the tool is not
 * auto-approved), feeds the results back and repeats until the model stops
 * asking for tools or the turn limit is reached.
 *
 * The transcript grows only in local memory — tool calls and results are never
 * written to the chat history, so the stored conversation stays prose + plan.
 */
export async function* runAgentTurn(
  options: AgentTurnOptions,
): AsyncGenerator<AgentEvent, void, unknown> {
  const { provider, streamOptions, tools, autoApproved, signal } = options;
  const serversById = new Map(options.servers.map((server) => [server.id, server]));
  const messages: ChatMessage[] = [...streamOptions.messages];
  const toolSpecs = tools.length ? toToolSpecs(tools, autoApproved) : [];

  /** Prose accumulated across turns; the plan block is always last. */
  let raw = "";
  let visibleLength = 0;
  /** Cleared when the endpoint turns out not to support tool definitions. */
  let toolsEnabled = toolSpecs.length > 0;
  let callCounter = 0;

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
    const toolCalls: { id: string; name: string; args: string }[] = [];
    let assistantText = "";
    let providerItems: unknown[] | undefined;

    const events = streamTurn({
      provider,
      streamOptions,
      messages,
      toolSpecs: toolsEnabled ? toolSpecs : [],
      signal,
      onUnsupported: () => {
        toolsEnabled = false;
      },
    });

    for await (const event of events) {
      if (event.type === "text") {
        assistantText += event.text;
        raw += event.text;
        const visible = visiblePrefix(raw);
        if (visible.length > visibleLength) {
          yield { type: "delta", text: visible.slice(visibleLength) };
          visibleLength = visible.length;
        }
        continue;
      }
      if (event.type === "tool_call") {
        callCounter += 1;
        toolCalls.push({
          id: event.id || `call_${callCounter}`,
          name: event.name,
          args: event.args,
        });
        continue;
      }
      if (event.type === "done") {
        providerItems = event.providerItems;
      }
    }

    if (!toolCalls.length) {
      yield { type: "final", text: raw };
      return;
    }

    messages.push({
      role: "assistant",
      content: assistantText,
      toolCalls,
      ...(providerItems ? { providerItems } : {}),
    });

    for (const call of toolCalls) {
      const tool = tools.find((candidate) => candidate.name === call.name);
      if (!tool) {
        // The model invented a name; tell it so it can correct itself.
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: `Error: unknown tool "${call.name}".`,
        });
        yield {
          type: "tool_result",
          callId: call.id,
          name: call.name,
          ok: false,
          summary: "unknown_tool",
        };
        continue;
      }

      if (!autoApproved.has(tool.name)) {
        yield {
          type: "tool_approval_required",
          callId: call.id,
          name: tool.name,
          toolName: tool.toolName,
          serverName: tool.serverName,
          args: call.args,
        };
        const approved = await waitForApproval(call.id, signal);
        yield {
          type: "tool_approval_resolved",
          callId: call.id,
          approved,
        };
        if (!approved) {
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: tool.name,
            content:
              "Error: the user denied this tool call. Do not retry it; continue with what you know, or ask the user.",
          });
          yield {
            type: "tool_result",
            callId: call.id,
            name: tool.name,
            ok: false,
            summary: "denied",
          };
          continue;
        }
      }

      yield {
        type: "tool_call",
        callId: call.id,
        name: tool.name,
        toolName: tool.toolName,
        serverName: tool.serverName,
        args: call.args,
      };

      const server = serversById.get(tool.serverId);
      if (!server) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: tool.name,
          content: "Error: the MCP server is not configured any more.",
        });
        yield {
          type: "tool_result",
          callId: call.id,
          name: tool.name,
          ok: false,
          summary: "server_missing",
        };
        continue;
      }

      try {
        const result = await callServerTool(
          server,
          tool.toolName,
          parseToolArgs(call.args),
        );
        const text = truncateToolResult(
          result.isError ? `Error: ${result.text}` : result.text,
        );
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: tool.name,
          content: text,
        });
        yield {
          type: "tool_result",
          callId: call.id,
          name: tool.name,
          ok: !result.isError,
          summary: summarize(text),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "mcp_error";
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: tool.name,
          content: `Error: ${message}`,
        });
        yield {
          type: "tool_result",
          callId: call.id,
          name: tool.name,
          ok: false,
          summary: message,
        };
      }
    }
  }

  // Turn limit reached with the model still asking for tools: hand back what it
  // wrote so the plan block is not silently discarded.
  yield { type: "final", text: raw };
}

/**
 * Streams one provider turn, degrading gracefully when the endpoint does not
 * understand tool definitions: the error is swallowed, tools are disabled and
 * the turn is retried as a plain completion.
 */
async function* streamTurn(options: {
  provider: AIProvider;
  streamOptions: ChatStreamOptions;
  messages: ChatMessage[];
  toolSpecs: ReturnType<typeof toToolSpecs>;
  signal?: AbortSignal;
  onUnsupported: () => void;
}): AsyncGenerator<ProviderEvent, void, unknown> {
  const { provider, streamOptions, messages, toolSpecs, signal, onUnsupported } =
    options;
  const base = { ...streamOptions, messages, signal };

  if (!toolSpecs.length) {
    yield* plainTurn(provider, base);
    return;
  }

  let emitted = false;
  try {
    if (provider.streamTurn) {
      for await (const event of provider.streamTurn({ ...base, tools: toolSpecs })) {
        emitted = true;
        yield event;
      }
      return;
    }
    // Adapter without structured streaming: text only, no tool calls.
    yield* plainTurn(provider, base);
    return;
  } catch (error) {
    // Retrying after text already reached the viewer would duplicate it, so the
    // fallback only applies to a request rejected up front.
    if (emitted || !isToolUnsupported(error)) throw error;
    onUnsupported();
    yield* plainTurn(provider, base);
  }
}

async function* plainTurn(
  provider: AIProvider,
  options: ChatStreamOptions,
): AsyncGenerator<ProviderEvent, void, unknown> {
  for await (const chunk of provider.chatStream(options)) {
    yield { type: "text", text: chunk };
  }
  yield { type: "done" };
}

/**
 * Endpoints that do not implement tools reject the request outright. The
 * message is the only signal available, so a narrow match is used and the chat
 * continues without tools rather than failing.
 */
function isToolUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) return false;
  return (
    /unknown (?:parameter|field|argument)/.test(message) &&
    /(tool|function)/.test(message)
  );
}

function summarize(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}
