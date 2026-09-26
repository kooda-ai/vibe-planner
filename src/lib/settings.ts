import { getSettingsRecord, saveSettings } from "./db";
import { uniqueSlug } from "./skills";
import {
  CODEX_MODELS,
  CODEX_PROVIDER_TYPE,
  MCP_TRANSPORT_TYPES,
  PROVIDER_TYPES,
  isLegacyCodexModel,
  type AppSettings,
  type MCPServerConfig,
  type MCPTransportType,
  type ProviderType,
  type SkillConfig,
  type StoredProvider,
} from "./types";

export const SETTINGS_KEYS = {
  providers: "providers",
  defaultProviderId: "defaultProviderId",
  defaultModel: "defaultModel",
  mcpServers: "mcpServers",
  skills: "skills",
  projectSkills: "projectSkills",
  toolPermissions: "toolPermissions",
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
    // MCP `env`/`headers` may hold secrets (tokens), so they are stripped for
    // the client just like provider API keys are.
    mcpServers: parseMCPServers(record[SETTINGS_KEYS.mcpServers]).map((server) =>
      toMCPServerSummary(server),
    ),
    skills: parseSkills(record[SETTINGS_KEYS.skills]),
  };
}

/* -------------------------------------------------------------------------- */
/*                              MCP server storage                            */
/* -------------------------------------------------------------------------- */

export function isMCPTransport(value: unknown): value is MCPTransportType {
  return MCP_TRANSPORT_TYPES.includes(value as MCPTransportType);
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, val]): [string, string] => [key, val]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function parseMCPServers(raw: string | undefined): MCPServerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): MCPServerConfig[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<MCPServerConfig>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        !isMCPTransport(candidate.transport)
      ) {
        return [];
      }
      const transport = candidate.transport;
      const command =
        typeof candidate.command === "string" ? candidate.command.trim() : "";
      const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
      // A stdio server without a command and a remote server without a URL can
      // never connect, so they are dropped rather than shown as broken rows.
      if (transport === "stdio" ? !command : !url) return [];
      return [
        {
          id: candidate.id,
          name: candidate.name,
          transport,
          command: transport === "stdio" ? command : undefined,
          args:
            transport === "stdio" && Array.isArray(candidate.args)
              ? candidate.args.filter((arg): arg is string => typeof arg === "string")
              : undefined,
          env: transport === "stdio" ? parseStringRecord(candidate.env) : undefined,
          url: transport === "stdio" ? undefined : url,
          headers:
            transport === "stdio" ? undefined : parseStringRecord(candidate.headers),
          enabled: candidate.enabled !== false,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function readMCPServers(): Promise<MCPServerConfig[]> {
  const record = await getSettingsRecord();
  return parseMCPServers(record[SETTINGS_KEYS.mcpServers]);
}

export async function writeMCPServers(servers: MCPServerConfig[]): Promise<void> {
  await saveSettings({ [SETTINGS_KEYS.mcpServers]: JSON.stringify(servers) });
}

/**
 * Client-safe view of a server: `env`/`headers` keep their keys but lose their
 * values, so a token never reaches the browser. An empty value on save means
 * "keep what is stored" (same contract as provider API keys).
 */
export function toMCPServerSummary(server: MCPServerConfig): MCPServerConfig {
  const mask = (record: Record<string, string> | undefined) =>
    record
      ? Object.fromEntries(Object.keys(record).map((key) => [key, ""]))
      : undefined;
  return {
    ...server,
    env: mask(server.env),
    headers: mask(server.headers),
  };
}

export async function readSkills(): Promise<SkillConfig[]> {
  const record = await getSettingsRecord();
  return parseSkills(record[SETTINGS_KEYS.skills]);
}

export function parseSkills(raw: string | undefined): SkillConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen: string[] = [];
    return parsed.flatMap((entry): SkillConfig[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<SkillConfig>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.body !== "string"
      ) {
        return [];
      }
      // `slug` was added after the first skills shipped; derive it when absent.
      const slug =
        typeof candidate.slug === "string" && candidate.slug
          ? candidate.slug
          : uniqueSlug(candidate.name, seen);
      seen.push(slug);
      return [
        {
          id: candidate.id,
          name: candidate.name,
          slug,
          description:
            typeof candidate.description === "string" ? candidate.description : "",
          body: candidate.body,
          category:
            typeof candidate.category === "string" && candidate.category.trim()
              ? candidate.category.trim()
              : undefined,
          enabled: candidate.enabled !== false,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function writeSkills(skills: SkillConfig[]): Promise<void> {
  await saveSettings({ [SETTINGS_KEYS.skills]: JSON.stringify(skills) });
}

/** Per-project skill selection: `{ [projectId]: skillId[] }`. */
export type ProjectSkills = Record<string, string[]>;

export function parseProjectSkills(raw: string | undefined): ProjectSkills {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ProjectSkills = {};
    for (const [projectId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(value)) continue;
      result[projectId] = value.filter(
        (item): item is string => typeof item === "string",
      );
    }
    return result;
  } catch {
    return {};
  }
}

export async function readProjectSkills(): Promise<ProjectSkills> {
  const record = await getSettingsRecord();
  return parseProjectSkills(record[SETTINGS_KEYS.projectSkills]);
}

/** `null` means "no explicit selection" — every enabled skill applies. */
export async function readProjectSkillSelection(
  projectId: string,
): Promise<string[] | null> {
  const all = await readProjectSkills();
  const selection = all[projectId];
  return selection && selection.length ? selection : null;
}

export async function writeProjectSkillSelection(
  projectId: string,
  skillIds: string[],
): Promise<void> {
  const record = await getSettingsRecord();
  const all = parseProjectSkills(record[SETTINGS_KEYS.projectSkills]);
  if (skillIds.length) {
    all[projectId] = skillIds;
  } else {
    delete all[projectId];
  }
  await saveSettings({
    [SETTINGS_KEYS.projectSkills]: JSON.stringify(all),
  });
}

/**
 * Per-tool approval overrides, keyed by `"<serverId>:<toolName>"`. A tool with
 * no entry (or `false`) asks the user for confirmation before it runs.
 */
export type ToolPermissions = Record<string, boolean>;

export function parseToolPermissions(raw: string | undefined): ToolPermissions {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ToolPermissions = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "boolean") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export async function readToolPermissions(): Promise<ToolPermissions> {
  const record = await getSettingsRecord();
  return parseToolPermissions(record[SETTINGS_KEYS.toolPermissions]);
}

export async function writeToolPermissions(
  permissions: ToolPermissions,
): Promise<void> {
  await saveSettings({
    [SETTINGS_KEYS.toolPermissions]: JSON.stringify(permissions),
  });
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
