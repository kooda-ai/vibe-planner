import { NextResponse } from "next/server";

import { describeMCPError, listServerTools } from "@/lib/mcp/client";
import { namespacedToolName, serverSlug, toolPermissionKey } from "@/lib/mcp/tools";
import { readMCPServers, readToolPermissions } from "@/lib/settings";
import type { MCPToolInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "Test / List tools": connects to the server, pulls its catalogue and reports
 * the tools together with their current auto-approve setting.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const servers = await readMCPServers();
  const server = servers.find((candidate) => candidate.id === id);
  if (!server) {
    return NextResponse.json({ error: "server_not_found" }, { status: 404 });
  }

  try {
    const tools = await listServerTools(server);
    const permissions = await readToolPermissions();
    const slug = serverSlug(server);

    const detailed: MCPToolInfo[] = tools.map((tool) => ({
      name: namespacedToolName(slug, tool.name),
      toolName: tool.name,
      serverId: server.id,
      serverName: server.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      autoApprove:
        permissions[toolPermissionKey(server.id, tool.name)] === true,
    }));

    return NextResponse.json({ tools: detailed, status: "connected" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: describeMCPError(error) },
      { status: 502 },
    );
  }
}
