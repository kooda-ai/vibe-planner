import { NextResponse } from "next/server";

import { createTask } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    content?: unknown;
    description?: unknown;
    notes?: unknown;
    done?: unknown;
  };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content_required" }, { status: 400 });
  }

  const task = await createTask(id, {
    content,
    description:
      typeof body.description === "string" ? body.description.trim() || null : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    done: Boolean(body.done),
  });
  if (!task) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ task }, { status: 201 });
}
