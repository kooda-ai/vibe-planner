import { NextResponse } from "next/server";

import { deleteTask, updateTask } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: { content?: string; done?: boolean; order?: number } = {};
  if (typeof body.content === "string") {
    const content = body.content.trim();
    if (!content) {
      return NextResponse.json({ error: "content_required" }, { status: 400 });
    }
    patch.content = content;
  }
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.order === "number" && Number.isFinite(body.order)) {
    patch.order = body.order;
  }

  const task = await updateTask(id, patch);
  if (!task) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteTask(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
