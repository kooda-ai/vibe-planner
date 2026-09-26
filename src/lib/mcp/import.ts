import type { MCPServerConfig, MCPTransportType } from "../types";

type Entry = Record<string, unknown>;

/**
 * Parses a Claude Desktop / Cursor style `mcpServers` JSON blob into server
 * configs.
 *
 * Both shapes are accepted: the whole `{ "mcpServers": { … } }` document, or a
 * bare `{ "<name>": { … } }` map. `type` (Cursor's `"sse"`) and the presence of
 * `url` vs `command` decide the transport.
 */
export function parseImport(raw: string): {
  servers: Omit<MCPServerConfig, "id">[];
  errors: string[];
} {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { servers: [], errors: ["invalid_json"] };
  }

  const container = (parsed ?? {}) as Entry;
  const entries = (container.mcpServers ?? container) as Entry;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return { servers: [], errors: ["no_servers_found"] };
  }

  const servers: Omit<MCPServerConfig, "id">[] = [];
  for (const [name, value] of Object.entries(entries)) {
    const entry = (value ?? {}) as Entry;
    const command = typeof entry.command === "string" ? entry.command : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    const declared = typeof entry.type === "string" ? entry.type.toLowerCase() : "";

    if (command) {
      servers.push({
        name,
        transport: "stdio",
        command,
        args: Array.isArray(entry.args)
          ? entry.args.filter((arg): arg is string => typeof arg === "string")
          : [],
        env: stringRecord(entry.env),
        enabled: true,
      });
      continue;
    }

    if (url) {
      const transport: MCPTransportType = declared === "sse" ? "sse" : "http";
      servers.push({
        name,
        transport,
        url,
        headers: stringRecord(entry.headers),
        enabled: true,
      });
      continue;
    }

    // `disabled: true` entries are intentional no-ops in some exports.
    if (entry.disabled !== true) errors.push(name);
  }

  return { servers, errors };
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((item): item is [string, string] => typeof item[1] === "string");
  return entries.length ? Object.fromEntries(entries) : undefined;
}
