import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { MCPServerConfig } from "../types";

/** How long a single MCP request (connect, list, call) may take. */
export const MCP_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Builds the SDK transport for a stored server config.
 *
 * Every entry point here is Node-only (`stdio` spawns a child process, the HTTP
 * transports rely on `fetch`/`EventSource`), so this module must never be
 * imported from client components.
 */
export function createTransport(server: MCPServerConfig): Transport {
  switch (server.transport) {
    case "stdio": {
      if (!server.command) {
        throw new Error("mcp_missing_command");
      }
      return new StdioClientTransport({
        command: server.command,
        args: server.args ?? [],
        // The SDK inherits a filtered environment by default; the user's own
        // variables are merged on top so a server can be given an API token.
        env: {
          ...getProcessEnv(),
          ...(server.env ?? {}),
        },
        stderr: "ignore",
      });
    }
    case "sse": {
      if (!server.url) throw new Error("mcp_missing_url");
      return new SSEClientTransport(new URL(server.url), {
        // The legacy SSE transport opens a GET stream and then POSTs to the
        // endpoint it announces; headers have to be set on both requests.
        requestInit: { headers: server.headers ?? {} },
        eventSourceInit: {
          fetch: (url: string | URL, init?: RequestInit) =>
            fetch(url, {
              ...init,
              headers: {
                ...((init?.headers as Record<string, string>) ?? {}),
                ...(server.headers ?? {}),
              },
            }),
        },
      });
    }
    case "http":
    default: {
      if (!server.url) throw new Error("mcp_missing_url");
      return new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: server.headers ?? {} },
      });
    }
  }
}

/** `process.env` as a plain string record (values may be undefined). */
function getProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}
