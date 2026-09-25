import { NextResponse } from "next/server";

import { reorderPhases } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((v) => typeof v !== "string")) {
    return NextResponse.json({ error: "ids_required" }, { status: 400 });
  }
  const phases = await reorderPhases(id, body.ids as string[]);
  return NextResponse.json({ phases });
}
