import { NextResponse } from "next/server";

import { deleteProject, getProjectDetail, updateProject } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
  };

  const patch: { name?: string; description?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.description !== undefined) {
    patch.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }

  const project = await updateProject(id, patch);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteProject(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
