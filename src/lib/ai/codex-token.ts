import { parseProviders, SETTINGS_KEYS, writeProviders } from "../settings";
import { getSettingsRecord } from "../db";
import type { StoredProvider } from "../types";
import {
  extractAccountId,
  extractEmail,
  refreshAccessToken,
} from "./codex-oauth";
import { ProviderError } from "./types";

/** Refreshes a bit before the real expiry so a request never races the clock. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export interface CodexAuth {
  accessToken: string;
  accountId?: string;
}

/**
 * Returns a usable access token for a Codex provider, refreshing (and
 * persisting the refreshed token) when it is about to expire. Callers never
 * have to think about expiry — a stale token is renewed silently.
 */
export async function ensureFreshCodexAuth(
  provider: StoredProvider,
): Promise<CodexAuth> {
  const fresh =
    provider.apiKey &&
    typeof provider.expiresAt === "number" &&
    provider.expiresAt - EXPIRY_MARGIN_MS > Date.now();

  if (fresh) {
    return { accessToken: provider.apiKey, accountId: provider.accountId };
  }

  if (!provider.refreshToken) {
    throw new ProviderError(
      "The ChatGPT session has expired. Reconnect the account in Settings.",
      401,
    );
  }

  let tokens;
  try {
    tokens = await refreshAccessToken(provider.refreshToken);
  } catch (error) {
    throw new ProviderError(
      `Could not refresh the ChatGPT session: ${
        error instanceof Error ? error.message : "unknown error"
      }. Reconnect the account in Settings.`,
      401,
    );
  }

  const accountId = extractAccountId(tokens) ?? provider.accountId;
  const email = extractEmail(tokens) ?? provider.accountEmail;
  const expiresAt = Date.now() + (tokens.expiresIn ?? 3600) * 1000;

  // Persist server-side so the next request (and a restart) reuses the token.
  const record = await getSettingsRecord();
  const stored = parseProviders(record[SETTINGS_KEYS.providers]);
  const next = stored.map((item) =>
    item.id === provider.id
      ? {
          ...item,
          apiKey: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accountId,
          accountEmail: email,
          expiresAt,
        }
      : item,
  );
  await writeProviders(next);

  return { accessToken: tokens.accessToken, accountId };
}
