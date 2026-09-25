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

export type ProviderType = "openai" | "anthropic" | "openai-compatible";

export const PROVIDER_TYPES: ProviderType[] = [
  "openai",
  "anthropic",
  "openai-compatible",
];

/** Provider as returned to the client — never contains the API key. */
export interface ProviderSummary {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  models: string[];
  hasApiKey: boolean;
}

export interface AppSettings {
  providers: ProviderSummary[];
  defaultProviderId: string | null;
  defaultModel: string | null;
}

/** Provider as stored on the server (includes the secret). */
export interface StoredProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey: string;
  models: string[];
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
