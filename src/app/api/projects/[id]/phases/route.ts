import { NextResponse } from "next/server";

import { createPhase, getProjectDetail } from "@/lib/db";
import { PHASE_STATUSES, type PhaseStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseStatus(value: unknown): PhaseStatus | undefined {
  return PHASE_STATUSES.includes(value as PhaseStatus)
    ? (value as PhaseStatus)
    : undefined;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ phases: detail.phases });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    description?: unknown;
    notes?: unknown;
    status?: unknown;
    tasks?: unknown;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  const tasks = Array.isArray(body.tasks)
    ? body.tasks.flatMap((task) => {
        if (!task || typeof task !== "object") return [];
        const candidate = task as { content?: unknown; done?: unknown };
        if (typeof candidate.content !== "string" || !candidate.content.trim()) {
          return [];
        }
        return [{ content: candidate.content, done: Boolean(candidate.done) }];
      })
    : undefined;

  const phase = await createPhase(id, {
    title,
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    notes:
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim()
        : null,
    status: parseStatus(body.status),
    tasks,
  });

  if (!phase) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ phase }, { status: 201 });
}
