import { NextResponse } from "next/server";

import { deleteProject, listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Wipes every project (and its phases / messages). Settings are kept. */
export async function DELETE() {
  const projects = await listProjects();
  for (const project of projects) {
    await deleteProject(project.id);
  }
  return NextResponse.json({ ok: true, deleted: projects.length });
}
