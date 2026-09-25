import { NextResponse } from "next/server";

import { deletePhase, updatePhase } from "@/lib/db";
import { PHASE_STATUSES, type PhaseStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: {
    title?: string;
    description?: string | null;
    notes?: string | null;
    status?: PhaseStatus;
    order?: number;
  } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "title_required" }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if (body.notes !== undefined) {
    patch.notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes : null;
  }
  if (PHASE_STATUSES.includes(body.status as PhaseStatus)) {
    patch.status = body.status as PhaseStatus;
  }
  if (typeof body.order === "number" && Number.isFinite(body.order)) {
    patch.order = body.order;
  }

  const phase = await updatePhase(id, patch);
  if (!phase) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ phase });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deletePhase(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
