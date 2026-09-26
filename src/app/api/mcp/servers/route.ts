import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { disconnect } from "@/lib/mcp/client";
import { toolPermissionKey } from "@/lib/mcp/tools";
import {
  isMCPTransport,
  readMCPServers,
  readToolPermissions,
  toMCPServerSummary,
  writeMCPServers,
  writeToolPermissions,
} from "@/lib/settings";
import type { MCPServerConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ServerPayload {
  id?: unknown;
  name?: unknown;
  transport?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  url?: unknown;
  headers?: unknown;
  enabled?: unknown;
  /** Tools whose approvals are being changed in the same save. */
  tools?: unknown;
}

/**
 * Merges an incoming server payload with what is stored.
 *
 * Secret values behave like provider API keys: an empty value in `env`/`headers`
 * means "keep the stored one", so the client (which never receives the values)
 * can round-trip a server without wiping its tokens.
 */
function toServer(
  payload: ServerPayload,
  previous: Map<string, MCPServerConfig>,
): MCPServerConfig | null {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || !isMCPTransport(payload.transport)) return null;
  const id = typeof payload.id === "string" && payload.id ? payload.id : randomUUID();
  const transport = payload.transport;
  const prior = previous.get(id);

  if (transport === "stdio") {
    const command =
      typeof payload.command === "string" ? payload.command.trim() : "";
    if (!command) return null;
    return {
      id,
      name,
      transport,
      command,
      args: Array.isArray(payload.args)
        ? payload.args.filter((arg): arg is string => typeof arg === "string")
        : (prior?.args ?? []),
      env: mergeSecrets(payload.env, prior?.env),
      enabled: payload.enabled !== false,
    };
  }

  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) return null;
  return {
    id,
    name,
    transport,
    url,
    headers: mergeSecrets(payload.headers, prior?.headers),
    enabled: payload.enabled !== false,
  };
}

/** Merges new `KEY=VALUE` entries over the stored ones, keeping blank values. */
function mergeSecrets(
  value: unknown,
  stored: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return stored;
  const merged: Record<string, string> = { ...(stored ?? {}) };
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    if (raw === "" && stored?.[key] !== undefined) continue;
    merged[key] = raw;
  }
  return Object.keys(merged).length ? merged : undefined;
}

/** Reads the per-tool approval overrides out of the payload. */
function collectPermissions(
  payload: ServerPayload,
  serverId: string,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!Array.isArray(payload.tools)) return result;
  for (const entry of payload.tools) {
    if (!entry || typeof entry !== "object") continue;
    const tool = entry as { toolName?: unknown; autoApprove?: unknown };
    if (typeof tool.toolName !== "string") continue;
    result.set(
      toolPermissionKey(serverId, tool.toolName),
      tool.autoApprove === true,
    );
  }
  return result;
}

export async function GET() {
  const servers = await readMCPServers();
  return NextResponse.json({ servers: servers.map(toMCPServerSummary) });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { servers?: unknown };
  if (!Array.isArray(body.servers)) {
    return NextResponse.json({ error: "servers_required" }, { status: 400 });
  }

  const current = await readMCPServers();
  const previous = new Map(current.map((server) => [server.id, server]));

  const next: MCPServerConfig[] = [];
  const permissionUpdates = new Map<string, boolean>();
  for (const entry of body.servers) {
    if (!entry || typeof entry !== "object") continue;
    const payload = entry as ServerPayload;
    const server = toServer(payload, previous);
    if (!server) continue;
    next.push(server);
    for (const [key, value] of collectPermissions(payload, server.id)) {
      permissionUpdates.set(key, value);
    }
  }

  await writeMCPServers(next);

  // Permissions belonging to servers that no longer exist are dropped.
  const live = new Set(next.map((server) => server.id));
  const permissions = await readToolPermissions();
  const merged = Object.fromEntries(
    Object.entries(permissions).filter(([key]) =>
      live.has(key.slice(0, key.indexOf(":"))),
    ),
  );
  for (const [key, value] of permissionUpdates) merged[key] = value;
  await writeToolPermissions(merged);

  const saved = await readMCPServers();
  return NextResponse.json({ servers: saved.map(toMCPServerSummary) });
}

/** Removes a single server, its connection and its tool permissions. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const current = await readMCPServers();
  const next = current.filter((server) => server.id !== id);
  await writeMCPServers(next);
  await disconnect(id);

  const permissions = await readToolPermissions();
  await writeToolPermissions(
    Object.fromEntries(
      Object.entries(permissions).filter(
        ([key]) => !key.startsWith(`${id}:`),
      ),
    ),
  );

  return NextResponse.json({ servers: next.map(toMCPServerSummary) });
}
