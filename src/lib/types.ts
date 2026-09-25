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
 * The Codex backend exposes no model catalogue, so this built-in list is what
 * a Codex provider starts with. Users can edit it per provider.
 */
export const CODEX_MODELS: string[] = [
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
];

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
