import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai";
import { getSettingsRecord } from "@/lib/db";
import {
  SETTINGS_KEYS,
  isProviderType,
  readProviders,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Lists models for a provider. Accepts either a stored provider (`providerId`)
 * or ad-hoc credentials while the user is still filling in the settings form.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    providerId?: unknown;
    type?: unknown;
    apiKey?: unknown;
    baseUrl?: unknown;
  };

  let type = isProviderType(body.type) ? body.type : undefined;
  let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  let baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

  if (typeof body.providerId === "string" && body.providerId) {
    const [providers, record] = await Promise.all([
      readProviders(),
      getSettingsRecord(),
    ]);
    const stored =
      providers.find((p) => p.id === body.providerId) ??
      providers.find((p) => p.id === record[SETTINGS_KEYS.defaultProviderId]);
    if (!stored) {
      return NextResponse.json({ error: "provider_not_found" }, { status: 404 });
    }
    type = stored.type;
    apiKey = apiKey || stored.apiKey;
    baseUrl = baseUrl || stored.baseUrl || "";
  }

  if (!type || !apiKey) {
    return NextResponse.json({ error: "credentials_required" }, { status: 400 });
  }

  try {
    const models = await getProvider(type).listModels({
      apiKey,
      baseUrl: baseUrl || undefined,
    });
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
