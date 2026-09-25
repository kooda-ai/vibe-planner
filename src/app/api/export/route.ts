import { NextResponse } from "next/server";

import { exportProject, listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Full backup: every project with its phases and messages. */
export async function GET() {
  const projects = await listProjects();
  const bundles = [];
  for (const project of projects) {
    const bundle = await exportProject(project.id);
    if (bundle) bundles.push(bundle);
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: bundles,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="vibe-planner-backup.json"',
    },
  });
}
