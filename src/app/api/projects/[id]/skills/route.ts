import { NextResponse } from "next/server";

import { getProjectDetail } from "@/lib/db";
import { readProjectSkillSelection, writeProjectSkillSelection } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The project's skill selection; `null` means "all globally enabled skills". */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ skillIds: await readProjectSkillSelection(id) });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { skillIds?: unknown };
  if (!Array.isArray(body.skillIds)) {
    return NextResponse.json({ error: "skill_ids_required" }, { status: 400 });
  }

  const skillIds = body.skillIds.filter(
    (value): value is string => typeof value === "string",
  );
  await writeProjectSkillSelection(id, skillIds);
  return NextResponse.json({ skillIds: skillIds.length ? skillIds : null });
}
