import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCodexAuthResult } from "@/lib/ai/codex-auth-server";
import { extractAccountId, extractEmail } from "@/lib/ai/codex-oauth";
import {
  SETTINGS_KEYS,
  isCodexProvider,
  parseProviders,
  toAppSettings,
  writeProviders,
} from "@/lib/settings";
import { getSettingsRecord } from "@/lib/db";
import {
  CODEX_MODELS,
  CODEX_PROVIDER_TYPE,
  type StoredProvider,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Polls a ChatGPT login attempt. Once the browser callback delivered tokens,
 * they are persisted server-side (the client never sees them) and the stored
 * provider row is returned in its public, secret-free shape.
 */
export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get("state");
  if (!state) {
    return NextResponse.json({ error: "state_required" }, { status: 400 });
  }

  const result = getCodexAuthResult(state);
  if (result.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }
  if (result.status === "expired") {
    return NextResponse.json({ status: "expired" });
  }
  if (result.status === "error") {
    return NextResponse.json({ status: "error", message: result.message });
  }

  const { tokens } = result;
  const accountId = extractAccountId(tokens);
  const email = extractEmail(tokens);

  const record = await getSettingsRecord();
  const providers = parseProviders(record[SETTINGS_KEYS.providers]);

  // One ChatGPT account per server: an existing codex provider is updated in
  // place instead of piling up duplicates.
  const existing = providers.find(isCodexProvider);
  const provider: StoredProvider = {
    id: existing?.id ?? randomUUID(),
    name: existing?.name ?? "OpenAI (ChatGPT)",
    type: CODEX_PROVIDER_TYPE,
    apiKey: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accountId,
    accountEmail: email,
    expiresAt: Date.now() + (tokens.expiresIn ?? 3600) * 1000,
    models: existing?.models.length ? existing.models : [...CODEX_MODELS],
  };

  const next = existing
    ? providers.map((item) => (item.id === existing.id ? provider : item))
    : [...providers, provider];
  await writeProviders(next);

  const settings = toAppSettings(next, record);
  const summary = settings.providers.find((item) => item.id === provider.id)!;

  return NextResponse.json({ status: "connected", provider: summary });
}
