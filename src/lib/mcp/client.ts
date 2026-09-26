import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { MCPServerConfig } from "../types";
import { MCP_REQUEST_TIMEOUT_MS, createTransport } from "./config";

/**
 * Long-lived MCP connections, one per configured server.
 *
 * Connecting to a stdio server spawns a process and remote servers keep an open
 * stream, so connections are reused (keyed by server id) instead of being made
 * per chat turn. The cache has to survive Next's dev-mode HMR, and a module
 * level `Map` is discarded when the route module is re-evaluated — hence the
 * `globalThis` anchor.
 */

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface Connection {
  client: Client;
  /** Config fingerprint; a reconfigured server is reconnected. */
  signature: string;
}

interface MCPGlobal {
  __plannerMcpConnections?: Map<string, Connection>;
}

const globalStore = globalThis as unknown as MCPGlobal;

function connections(): Map<string, Connection> {
  if (!globalStore.__plannerMcpConnections) {
    globalStore.__plannerMcpConnections = new Map();
  }
  return globalStore.__plannerMcpConnections;
}

/** Cheap fingerprint of the fields that affect the connection itself. */
function signatureOf(server: MCPServerConfig): string {
  return JSON.stringify([
    server.transport,
    server.command,
    server.args,
    server.env,
    server.url,
    server.headers,
  ]);
}

/** Raised for MCP-side failures so routes can return a readable message. */
export class MCPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCPError";
  }
}

export function describeMCPError(error: unknown): string {
  if (error instanceof MCPError) return error.message;
  if (error instanceof Error) return error.message;
  return "mcp_unknown_error";
}

async function connect(server: MCPServerConfig): Promise<Client> {
  const client = new Client(
    { name: "vibe-planner", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(createTransport(server), {
    timeout: MCP_REQUEST_TIMEOUT_MS,
  });
  return client;
}

async function getConnection(server: MCPServerConfig): Promise<Client> {
  const signature = signatureOf(server);
  const cached = connections().get(server.id);
  if (cached && cached.signature === signature) return cached.client;
  if (cached) await disconnect(server.id);

  const client = await connect(server);
  connections().set(server.id, { client, signature });
  return client;
}

export async function disconnect(serverId: string): Promise<void> {
  const cached = connections().get(serverId);
  if (!cached) return;
  connections().delete(serverId);
  try {
    await cached.client.close();
  } catch {
    // The process may already be gone; nothing left to clean up.
  }
}

/** Drops cached connections that no longer belong to a configured server. */
export async function pruneConnections(
  configured: MCPServerConfig[],
): Promise<void> {
  const alive = new Set(configured.map((server) => server.id));
  for (const id of [...connections().keys()]) {
    if (!alive.has(id)) await disconnect(id);
  }
}

/** Connects (if needed) and lists the server's tools. */
export async function listServerTools(
  server: MCPServerConfig,
): Promise<MCPToolDefinition[]> {
  try {
    const client = await getConnection(server);
    const result = await client.listTools(undefined, {
      timeout: MCP_REQUEST_TIMEOUT_MS,
    });
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema ?? {
        type: "object",
        properties: {},
      }) as Record<string, unknown>,
    }));
  } catch (error) {
    await disconnect(server.id);
    throw new MCPError(describeMCPError(error));
  }
}

/**
 * Calls a tool and flattens the MCP content blocks into plain text so it can be
 * handed back to any provider as a tool result.
 */
export async function callServerTool(
  server: MCPServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  try {
    const client = await getConnection(server);
    const result = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: MCP_REQUEST_TIMEOUT_MS },
    );
    return {
      text: stringifyToolResult(result as unknown as Record<string, unknown>),
      isError: result.isError === true,
    };
  } catch (error) {
    await disconnect(server.id);
    throw new MCPError(describeMCPError(error));
  }
}

function stringifyToolResult(result: Record<string, unknown>): string {
  const parts: string[] = [];
  const content = Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item.type === "resource") {
      const resource = item.resource as { text?: string } | undefined;
      if (typeof resource?.text === "string") parts.push(resource.text);
    } else {
      parts.push(JSON.stringify(item));
    }
  }
  if (!parts.length && result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  return parts.join("\n").trim() || "(empty result)";
}
