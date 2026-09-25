import { NextResponse } from "next/server";

import { importProject, type ExportBundle } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Imports a single export bundle, or a full backup `{ projects: [...] }`. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const candidate = body as {
    project?: ExportBundle["project"];
    projects?: unknown;
  };

  const bundles: ExportBundle[] = Array.isArray(candidate.projects)
    ? (candidate.projects.filter(
        (item): item is ExportBundle =>
          Boolean(item) && typeof item === "object" && "project" in item,
      ) as ExportBundle[])
    : [body as ExportBundle];

  const valid = bundles.filter(
    (bundle) => bundle.project && typeof bundle.project.name === "string",
  );
  if (!valid.length) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const imported = [];
  for (const bundle of valid) {
    imported.push(await importProject(bundle));
  }

  return NextResponse.json({ imported: imported.length, projects: imported });
}
