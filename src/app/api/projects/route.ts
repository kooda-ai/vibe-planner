import { NextResponse } from "next/server";

import { createProject, listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const project = await createProject({ name, description });
  return NextResponse.json({ project }, { status: 201 });
}
