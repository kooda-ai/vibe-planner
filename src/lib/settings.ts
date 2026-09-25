import { getSettingsRecord, saveSettings } from "./db";
import {
  PROVIDER_TYPES,
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
      return [
        {
          id: candidate.id,
          name: candidate.name,
          type: candidate.type,
          apiKey: candidate.apiKey,
          baseUrl: candidate.baseUrl || undefined,
          models: Array.isArray(candidate.models)
            ? candidate.models.filter((m): m is string => typeof m === "string")
            : [],
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

/** Public (client-safe) view of the settings — API keys are stripped. */
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
