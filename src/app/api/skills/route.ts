import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getSettingsRecord, saveSettings } from "@/lib/db";
import {
  SETTINGS_KEYS,
  parseProjectSkills,
  parseSkills,
  writeSkills,
} from "@/lib/settings";
import { uniqueSlug } from "@/lib/skills";
import type { SkillConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SkillPayload {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  body?: unknown;
  category?: unknown;
  enabled?: unknown;
}

export async function GET() {
  const record = await getSettingsRecord();
  return NextResponse.json({ skills: parseSkills(record[SETTINGS_KEYS.skills]) });
}

/**
 * Replaces the whole skill list (the settings UI edits an array in place).
 *
 * A skill's slug is derived from its name and kept stable while the name is
 * unchanged, so existing `/slash` habits keep working across edits. Collisions
 * are resolved with a numeric suffix.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { skills?: unknown };
  if (!Array.isArray(body.skills)) {
    return NextResponse.json({ error: "skills_required" }, { status: 400 });
  }

  const record = await getSettingsRecord();
  const previous = new Map(
    parseSkills(record[SETTINGS_KEYS.skills]).map((skill) => [skill.id, skill]),
  );

  const next: SkillConfig[] = [];
  const takenSlugs: string[] = [];
  for (const entry of body.skills) {
    if (!entry || typeof entry !== "object") continue;
    const payload = entry as SkillPayload;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const bodyText = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!name || !bodyText) continue;

    const id =
      typeof payload.id === "string" && payload.id ? payload.id : randomUUID();
    const prior = previous.get(id);
    const slug =
      prior && prior.name === name
        ? prior.slug
        : uniqueSlug(name, takenSlugs);
    takenSlugs.push(slug);

    next.push({
      id,
      name,
      slug,
      description:
        typeof payload.description === "string" ? payload.description.trim() : "",
      body: bodyText,
      category:
        typeof payload.category === "string" && payload.category.trim()
          ? payload.category.trim()
          : undefined,
      enabled: payload.enabled !== false,
    });
  }

  await writeSkills(next);

  // Drop project selections pointing at skills that no longer exist.
  const live = new Set(next.map((skill) => skill.id));
  const projectSkills = parseProjectSkills(record[SETTINGS_KEYS.projectSkills]);
  const cleaned: Record<string, string[]> = {};
  for (const [projectId, ids] of Object.entries(projectSkills)) {
    const kept = ids.filter((skillId) => live.has(skillId));
    if (kept.length) cleaned[projectId] = kept;
  }
  await saveSettings({
    [SETTINGS_KEYS.projectSkills]: JSON.stringify(cleaned),
  });

  return NextResponse.json({ skills: next });
}
