import { NextResponse } from "next/server";

import { exportProject } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const bundle = await exportProject(id);
  if (!bundle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const safeName = bundle.project.name.replace(/[^\w\-]+/g, "-").toLowerCase();
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${safeName || "project"}.json"`,
    },
  });
}
