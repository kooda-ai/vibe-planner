import { NextResponse } from "next/server";

import { startCodexOAuth } from "@/lib/ai/codex-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Starts a ChatGPT (Codex) login and returns the URL to open in a browser. */
export async function POST() {
  try {
    const { authUrl, state } = await startCodexOAuth();
    return NextResponse.json({ authUrl, state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start the login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
