import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai";
import { ensureFreshCodexAuth } from "@/lib/ai/codex-token";
import { getSettingsRecord } from "@/lib/db";
import {
  SETTINGS_KEYS,
  isCodexProvider,
  isProviderType,
  readProviders,
} from "@/lib/settings";
import { CODEX_PROVIDER_TYPE, type StoredProvider } from "@/lib/types";

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
  let stored: StoredProvider | undefined;

  if (typeof body.providerId === "string" && body.providerId) {
    const [providers, record] = await Promise.all([
      readProviders(),
      getSettingsRecord(),
    ]);
    stored =
      providers.find((p) => p.id === body.providerId) ??
      providers.find((p) => p.id === record[SETTINGS_KEYS.defaultProviderId]);
    if (!stored) {
      return NextResponse.json({ error: "provider_not_found" }, { status: 404 });
    }
    type = stored.type;
    apiKey = apiKey || stored.apiKey;
    baseUrl = baseUrl || stored.baseUrl || "";
  }

  if (!type) {
    return NextResponse.json({ error: "credentials_required" }, { status: 400 });
  }

  // A Codex provider authenticates with the linked ChatGPT account rather than
  // a key, so its token is refreshed here before the catalogue is fetched.
  let accountId: string | undefined;
  if (type === CODEX_PROVIDER_TYPE) {
    if (!stored) {
      return NextResponse.json({ error: "codex_not_connected" }, { status: 400 });
    }
    try {
      const auth = await ensureFreshCodexAuth(stored);
      apiKey = auth.accessToken;
      accountId = auth.accountId;
    } catch {
      return NextResponse.json({ error: "codex_reconnect_required" }, { status: 401 });
    }
  } else if (!apiKey) {
    return NextResponse.json({ error: "credentials_required" }, { status: 400 });
  }

  try {
    const models = await getProvider(type).listModels({
      apiKey,
      baseUrl: baseUrl || undefined,
      accountId,
    });
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
