import { NextResponse } from "next/server";

import { parseImport } from "@/lib/mcp/import";

export const dynamic = "force-dynamic";

/** Parses an `mcpServers` JSON blob for the import dialog. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { json?: unknown };
  const raw = typeof body.json === "string" ? body.json.trim() : "";
  if (!raw) {
    return NextResponse.json({ error: "json_required" }, { status: 400 });
  }

  const result = parseImport(raw);
  if (!result.servers.length) {
    return NextResponse.json(
      { error: result.errors[0] ?? "no_servers_found" },
      { status: 400 },
    );
  }
  return NextResponse.json(result);
}
