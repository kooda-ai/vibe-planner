/**
 * Shared, dependency-free types. Safe to import from both client and server
 * code (must not import Node APIs).
 */

export type PhaseStatus = "pending" | "in_progress" | "done";

export const PHASE_STATUSES: PhaseStatus[] = ["pending", "in_progress", "done"];

export interface Task {
  id: string;
  phaseId: string;
  order: number;
  content: string;
  /** What this task involves: the concrete work and how to verify it. */
  description: string | null;
  /** Research notes: findings, decisions, links, gotchas. */
  notes: string | null;
  done: boolean;
}

export interface Phase {
  id: string;
  projectId: string;
  order: number;
  title: string;
  description: string | null;
  notes: string | null;
  status: PhaseStatus;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  phaseCount: number;
  doneCount: number;
  taskCount: number;
  doneTaskCount: number;
}

export interface Message {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  /** Number of phases the assistant answer created/updated (assistant only). */
  phasesUpdated?: number;
  createdAt: string;
}

export interface ProjectDetail {
  project: Project;
  phases: Phase[];
  messages: Message[];
}

/* -------------------------------------------------------------------------- */
/*                              AI provider config                            */
/* -------------------------------------------------------------------------- */

export type ProviderType =
  | "openai"
  | "anthropic"
  | "openai-compatible"
  | "openai-codex";

export const PROVIDER_TYPES: ProviderType[] = [
  "openai",
  "anthropic",
  "openai-compatible",
  "openai-codex",
];

/**
 * "openai-codex" signs in with a ChatGPT Plus/Pro account through the Codex CLI
 * OAuth flow instead of an API key. It is unofficial and may break, so the UI
 * labels it as experimental.
 */
export const CODEX_PROVIDER_TYPE: ProviderType = "openai-codex";

/**
 * Fallback catalogue for a Codex provider.
 *
 * The Codex backend *does* list models (Settings has a "Fetch models" button
 * that queries it live and stores the result), but a fresh connection starts
 * from these slugs. They mirror Codex CLI's own bundled catalogue, and every
 * one of them is accepted with a ChatGPT account — unlike older `gpt-5.x-codex`
 * slugs, which the backend rejects as "not supported when using Codex with a
 * ChatGPT account".
 */
export const CODEX_MODELS: string[] = ["gpt-6-astra", "gpt-6-sol"];

/**
 * Slugs an earlier build of this app offered as Codex defaults, before the real
 * catalogue was wired up. The backend rejects every one of them for ChatGPT
 * accounts, so stored settings are migrated away from them on read.
 */
export const LEGACY_CODEX_MODELS: string[] = [
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.4",
  "gpt-5.4-mini",
];

export function isLegacyCodexModel(slug: string): boolean {
  return LEGACY_CODEX_MODELS.includes(slug);
}

/** Provider as returned to the client — never contains the API key or tokens. */
export interface ProviderSummary {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  models: string[];
  hasApiKey: boolean;
  /** Codex: an account is linked and the tokens are held server-side. */
  connected: boolean;
  /** Codex: e-mail of the linked ChatGPT account, when the token exposes it. */
  accountEmail?: string;
}

export interface AppSettings {
  providers: ProviderSummary[];
  defaultProviderId: string | null;
  defaultModel: string | null;
}

/**
 * Provider as stored on the server (includes the secrets).
 *
 * For `openai-codex`, `apiKey` holds the OAuth access token and the extra
 * fields carry the refresh token, the ChatGPT account id and the expiry.
 */
export interface StoredProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey: string;
  models: string[];
  refreshToken?: string;
  accountId?: string;
  /** Access token expiry as epoch milliseconds. */
  expiresAt?: number;
  accountEmail?: string;
}

/* -------------------------------------------------------------------------- */
/*                                 AI plan                                    */
/* -------------------------------------------------------------------------- */

export interface PlanTask {
  content: string;
  description?: string | null;
  notes?: string | null;
  done?: boolean;
}

export interface PlanPhase {
  id?: string | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  status?: PhaseStatus;
  tasks?: PlanTask[];
}

export interface Plan {
  phases: PlanPhase[];
}
