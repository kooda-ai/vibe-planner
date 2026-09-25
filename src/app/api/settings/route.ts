import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getSettingsRecord, saveSettings } from "@/lib/db";
import {
  SETTINGS_KEYS,
  isProviderType,
  parseProviders,
  readAppSettings,
  writeProviders,
} from "@/lib/settings";
import { CODEX_PROVIDER_TYPE, type StoredProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAppSettings());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    providers?: unknown;
    defaultProviderId?: unknown;
    defaultModel?: unknown;
  };

  const record = await getSettingsRecord();
  let providers = parseProviders(record[SETTINGS_KEYS.providers]);
  const existing = new Map(providers.map((p) => [p.id, p]));

  if (Array.isArray(body.providers)) {
    const next: StoredProvider[] = [];
    for (const entry of body.providers) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      if (!name || !isProviderType(candidate.type)) continue;

      const id = typeof candidate.id === "string" ? candidate.id : randomUUID();
      const previous = existing.get(id);
      // An empty apiKey means "keep the stored secret".
      const apiKey =
        typeof candidate.apiKey === "string" && candidate.apiKey.trim()
          ? candidate.apiKey.trim()
          : (previous?.apiKey ?? "");

      next.push({
        id,
        name,
        type: candidate.type,
        apiKey,
        baseUrl:
          typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()
            ? candidate.baseUrl.trim()
            : undefined,
        models: Array.isArray(candidate.models)
          ? candidate.models.flatMap((m) =>
              typeof m === "string" && m.trim() ? [m.trim()] : [],
            )
          : (previous?.models ?? []),
        // The ChatGPT tokens are written by the OAuth flow, never by the
        // client, so keep whatever the server stored for this provider.
        ...(candidate.type === CODEX_PROVIDER_TYPE
          ? {
              refreshToken: previous?.refreshToken,
              accountId: previous?.accountId,
              accountEmail: previous?.accountEmail,
              expiresAt: previous?.expiresAt,
            }
          : {}),
      });
    }
    providers = next;
    await writeProviders(providers);
  }

  const patch: Record<string, string> = {};

  if (body.defaultProviderId !== undefined) {
    const wanted =
      typeof body.defaultProviderId === "string" ? body.defaultProviderId : "";
    patch[SETTINGS_KEYS.defaultProviderId] = providers.some((p) => p.id === wanted)
      ? wanted
      : (providers[0]?.id ?? "");
  }

  if (body.defaultModel !== undefined) {
    patch[SETTINGS_KEYS.defaultModel] =
      typeof body.defaultModel === "string" ? body.defaultModel : "";
  }

  if (Object.keys(patch).length) await saveSettings(patch);

  return NextResponse.json(await readAppSettings());
}
