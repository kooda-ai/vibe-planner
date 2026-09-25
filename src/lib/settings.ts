import { getSettingsRecord, saveSettings } from "./db";
import {
  CODEX_MODELS,
  CODEX_PROVIDER_TYPE,
  PROVIDER_TYPES,
  isLegacyCodexModel,
  type AppSettings,
  type ProviderType,
  type StoredProvider,
} from "./types";

export const SETTINGS_KEYS = {
  providers: "providers",
  defaultProviderId: "defaultProviderId",
  defaultModel: "defaultModel",
} as const;

export function isProviderType(value: unknown): value is ProviderType {
  return PROVIDER_TYPES.includes(value as ProviderType);
}

export function isCodexProvider(provider: StoredProvider): boolean {
  return provider.type === CODEX_PROVIDER_TYPE;
}

/** Reads providers from storage, skipping anything malformed. */
export async function readProviders(): Promise<StoredProvider[]> {
  const record = await getSettingsRecord();
  return parseProviders(record[SETTINGS_KEYS.providers]);
}

export function parseProviders(raw: string | undefined): StoredProvider[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): StoredProvider[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<StoredProvider>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.apiKey !== "string" ||
        !isProviderType(candidate.type)
      ) {
        return [];
      }
      const models = Array.isArray(candidate.models)
        ? candidate.models.filter((m): m is string => typeof m === "string")
        : [];
      // Older builds seeded Codex providers with slugs the backend rejects for
      // ChatGPT accounts; drop them so a dead model is never picked blindly.
      const usableModels =
        candidate.type === CODEX_PROVIDER_TYPE
          ? models.filter((model) => !isLegacyCodexModel(model))
          : models;
      return [
        {
          id: candidate.id,
          name: candidate.name,
          type: candidate.type,
          apiKey: candidate.apiKey,
          baseUrl: candidate.baseUrl || undefined,
          models:
            candidate.type === CODEX_PROVIDER_TYPE && !usableModels.length
              ? [...CODEX_MODELS]
              : usableModels,
          refreshToken:
            typeof candidate.refreshToken === "string"
              ? candidate.refreshToken
              : undefined,
          accountId:
            typeof candidate.accountId === "string"
              ? candidate.accountId
              : undefined,
          expiresAt:
            typeof candidate.expiresAt === "number"
              ? candidate.expiresAt
              : undefined,
          accountEmail:
            typeof candidate.accountEmail === "string"
              ? candidate.accountEmail
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function writeProviders(providers: StoredProvider[]): Promise<void> {
  await saveSettings({ [SETTINGS_KEYS.providers]: JSON.stringify(providers) });
}

/** Public (client-safe) view of the settings — API keys and tokens are stripped. */
export function toAppSettings(
  providers: StoredProvider[],
  record: Record<string, string>,
): AppSettings {
  const defaultProviderId = record[SETTINGS_KEYS.defaultProviderId] ?? null;
  const exists = providers.some((p) => p.id === defaultProviderId);
  return {
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      models: provider.models,
      hasApiKey: Boolean(provider.apiKey),
      connected: isCodexProvider(provider) ? Boolean(provider.apiKey) : false,
      accountEmail: isCodexProvider(provider)
        ? provider.accountEmail
        : undefined,
    })),
    defaultProviderId: exists ? defaultProviderId : (providers[0]?.id ?? null),
    defaultModel: record[SETTINGS_KEYS.defaultModel] ?? null,
  };
}

export async function readAppSettings(): Promise<AppSettings> {
  const [providers, record] = await Promise.all([
    readProviders(),
    getSettingsRecord(),
  ]);
  return toAppSettings(providers, record);
}

/** Resolves which provider + model a chat request should use. */
export function pickProvider(
  providers: StoredProvider[],
  record: Record<string, string>,
  overrideId?: string | null,
  overrideModel?: string | null,
): { provider: StoredProvider; model: string } | null {
  if (!providers.length) return null;
  const wanted = overrideId || record[SETTINGS_KEYS.defaultProviderId];
  const provider =
    providers.find((p) => p.id === wanted) ??
    providers.find((p) => p.apiKey) ??
    providers[0];
  if (!provider) return null;

  const model =
    overrideModel ||
    (provider.id === record[SETTINGS_KEYS.defaultProviderId]
      ? record[SETTINGS_KEYS.defaultModel]
      : null) ||
    provider.models[0];

  if (!model) return null;
  return { provider, model };
}
