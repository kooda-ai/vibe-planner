import type { MCPServerConfig, ToolSpec } from "../types";
import { listServerTools, type MCPToolDefinition } from "./client";

/** Provider tool-name limit (OpenAI): `^[a-zA-Z0-9_-]{1,64}$`. */
const MAX_TOOL_NAME_LENGTH = 64;
const PREFIX = "mcp__";
/** Separates the server and tool segments of a namespaced name. */
const SEPARATOR = "__";

export interface NamespacedTool {
  /** Provider-facing name, e.g. `mcp__github__create_issue`. */
  name: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Keeps only characters providers accept in a tool name. */
function sanitize(part: string): string {
  const cleaned = part.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned || "tool";
}

/**
 * Combines server and tool name into a single provider-safe name.
 *
 * Two servers can expose the same tool name, so the server is part of the name.
 * The result is truncated to the provider limit while keeping the tail (the
 * tool name) intact, which is the part a human reads.
 */
export function namespacedToolName(serverSlug: string, toolName: string): string {
  const prefix = `${PREFIX}${sanitize(serverSlug)}${SEPARATOR}`;
  const budget = MAX_TOOL_NAME_LENGTH - prefix.length;
  const safeTool = sanitize(toolName);
  const trimmed = safeTool.length > budget ? safeTool.slice(0, budget) : safeTool;
  return `${prefix}${trimmed}`.slice(0, MAX_TOOL_NAME_LENGTH);
}

/** Collects the tools of every server into provider specs + a lookup table. */
export function toToolSpecs(
  tools: NamespacedTool[],
  autoApproved: Set<string>,
): ToolSpec[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: [
      tool.description || `${tool.toolName} (MCP tool)`,
      `Server: ${tool.serverName}.`,
      autoApproved.has(tool.name) ? "" : "Requires user approval before running.",
    ]
      .filter(Boolean)
      .join(" "),
    inputSchema: tool.inputSchema,
  }));
}

export interface CollectedTools {
  tools: NamespacedTool[];
  /** Servers that failed to connect, with the reason (non-fatal). */
  failures: { serverId: string; serverName: string; message: string }[];
}

/**
 * Connects to every enabled server and collects its tools.
 *
 * A server that cannot be reached does not fail the whole chat: its tools are
 * simply absent and the failure is reported so the UI can show it.
 */
export async function collectTools(
  servers: MCPServerConfig[],
): Promise<CollectedTools> {
  const enabled = servers.filter((server) => server.enabled);
  const tools: NamespacedTool[] = [];
  const failures: CollectedTools["failures"] = [];

  const results = await Promise.all(
    enabled.map(async (server) => {
      try {
        return { server, tools: await listServerTools(server) };
      } catch (error) {
        return {
          server,
          tools: null,
          message: error instanceof Error ? error.message : "mcp_error",
        };
      }
    }),
  );

  const usedNames = new Set<string>();
  for (const result of results) {
    if (!result.tools) {
      failures.push({
        serverId: result.server.id,
        serverName: result.server.name,
        message: result.message ?? "mcp_error",
      });
      continue;
    }
    const slug = slugFor(result.server, servers);
    for (const tool of dedupe(result.tools)) {
      let name = namespacedToolName(slug, tool.name);
      // Guarantee uniqueness even after truncation collisions.
      let counter = 2;
      while (usedNames.has(name)) {
        name = namespacedToolName(`${slug}${counter}`, tool.name);
        counter += 1;
      }
      usedNames.add(name);
      tools.push({
        name,
        serverId: result.server.id,
        serverName: result.server.name,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  return { tools, failures };
}

/** Disambiguates servers whose names slugify to the same value. */
function slugFor(server: MCPServerConfig, all: MCPServerConfig[]): string {
  const base = serverSlug(server);
  const sameSlug = all.filter((item) => item.enabled && serverSlug(item) === base);
  if (sameSlug.length <= 1) return base;
  return `${base}-${sameSlug.findIndex((item) => item.id === server.id) + 1}`;
}

/** Slug of a server name, as used in the namespaced tool name. */
export function serverSlug(server: MCPServerConfig): string {
  return (
    server.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server"
  );
}

function dedupe(tools: MCPToolDefinition[]): MCPToolDefinition[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}

/**
 * Storage key of a tool's approval setting.
 *
 * Keyed by the server *id* rather than its (mutable, collision-prone) slug, so
 * renaming a server does not silently reset its permissions.
 */
export function toolPermissionKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

/** Parses a tool-call argument string, tolerating empty / invalid payloads. */
export function parseToolArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return {};
  }
}

/** Truncates a tool result so one huge answer cannot blow up the context. */
export const TOOL_RESULT_LIMIT = 20_000;

export function truncateToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_LIMIT) return text;
  return `${text.slice(0, TOOL_RESULT_LIMIT)}\n…truncated`;
}
