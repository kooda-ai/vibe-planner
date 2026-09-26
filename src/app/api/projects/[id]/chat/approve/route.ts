import { NextResponse } from "next/server";

import { resolveApproval } from "@/lib/mcp/approvals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Answers a pending tool approval.
 *
 * The chat stream is one-way, so a tool that needs permission pauses the agent
 * loop on a promise; this request is what releases it. The `callId` alone
 * identifies the decision — it is unique per tool call within the process.
 */
export async function POST(request: Request, { params }: Params) {
  await params;
  const body = (await request.json().catch(() => ({}))) as {
    callId?: unknown;
    approved?: unknown;
  };

  const callId = typeof body.callId === "string" ? body.callId : "";
  if (!callId) {
    return NextResponse.json({ error: "call_id_required" }, { status: 400 });
  }

  const settled = resolveApproval(callId, body.approved === true);
  if (!settled) {
    // The call already timed out, was aborted, or never existed.
    return NextResponse.json({ error: "approval_expired" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
