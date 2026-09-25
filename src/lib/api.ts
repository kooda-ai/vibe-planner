import type {
  AppSettings,
  Message,
  Phase,
  PhaseStatus,
  Project,
  ProjectDetail,
  ProjectSummary,
  ProviderSummary,
  Task,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message =
      (detail && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : null) ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* --------------------------------- projects -------------------------------- */

export function fetchProjects() {
  return request<{ projects: ProjectSummary[] }>("/api/projects");
}

export function fetchProject(id: string) {
  return request<ProjectDetail>(`/api/projects/${id}`);
}

export function createProject(input: { name: string; description?: string }) {
  return request<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProject(
  id: string,
  input: { name?: string; description?: string | null },
) {
  return request<{ project: Project }>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" });
}

/* ---------------------------------- phases --------------------------------- */

export function createPhase(
  projectId: string,
  input: { title: string; description?: string | null },
) {
  return request<{ phase: Phase }>(`/api/projects/${projectId}/phases`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePhase(
  phaseId: string,
  patch: {
    title?: string;
    description?: string | null;
    notes?: string | null;
    status?: PhaseStatus;
    order?: number;
  },
) {
  return request<{ phase: Phase }>(`/api/phases/${phaseId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deletePhase(phaseId: string) {
  return request<{ ok: boolean }>(`/api/phases/${phaseId}`, { method: "DELETE" });
}

export function reorderPhases(projectId: string, ids: string[]) {
  return request<{ phases: Phase[] }>(`/api/projects/${projectId}/phases/reorder`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

/* ----------------------------------- tasks --------------------------------- */

export function createTask(phaseId: string, content: string) {
  return request<{ task: Task }>(`/api/phases/${phaseId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function updateTask(
  taskId: string,
  patch: { content?: string; done?: boolean },
) {
  return request<{ task: Task }>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(taskId: string) {
  return request<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: "DELETE" });
}

/* --------------------------------- settings -------------------------------- */

export function fetchSettings() {
  return request<AppSettings>("/api/settings");
}

export function saveSettings(payload: unknown) {
  return request<AppSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchModels(payload: {
  providerId?: string;
  type?: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  return request<{ models: string[] }>("/api/models", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetAllData() {
  return request<{ ok: boolean }>("/api/data", { method: "DELETE" });
}

/* ------------------------------ ChatGPT login ------------------------------ */

export type CodexStatus =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "connected"; provider: ProviderSummary };

export function startCodexLogin() {
  return request<{ authUrl: string; state: string }>("/api/oauth/codex/start", {
    method: "POST",
  });
}

export function pollCodexStatus(state: string) {
  return request<CodexStatus>(
    `/api/oauth/codex/status?state=${encodeURIComponent(state)}`,
  );
}

/**
 * Unlinks the ChatGPT account. The provider row carries the tokens, so dropping
 * it (and moving the default elsewhere if needed) is all it takes.
 */
export async function disconnectCodexProvider(id: string) {
  const settings = await fetchSettings();
  const providers = settings.providers
    .filter((provider) => provider.id !== id)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: "",
      models: provider.models,
    }));
  return saveSettings({
    providers,
    defaultProviderId:
      settings.defaultProviderId === id
        ? (providers[0]?.id ?? "")
        : settings.defaultProviderId,
  });
}

/* ----------------------------------- chat ---------------------------------- */

export interface ChatStreamHandlers {
  onDelta?: (text: string) => void;
  onDone?: (event: {
    body: string;
    phasesUpdated: number;
    invalidPlan: boolean;
    messageId?: string;
  }) => void;
  onError?: (message: string) => void;
}

/** Streams an NDJSON chat response, decoding each event as it arrives. */
export async function streamChat(
  projectId: string,
  payload: { prompt: string; locale: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    const code =
      detail && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : `http_${response.status}`;
    handlers.onError?.(code);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) dispatch(JSON.parse(line), handlers);
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail) dispatch(JSON.parse(tail), handlers);
  } finally {
    reader.releaseLock();
  }
}

function dispatch(
  event: {
    type: string;
    text?: string;
    body?: string;
    phasesUpdated?: number;
    invalidPlan?: boolean;
    message?: string;
    messageId?: string;
  },
  handlers: ChatStreamHandlers,
) {
  if (event.type === "delta" && event.text) handlers.onDelta?.(event.text);
  if (event.type === "error") handlers.onError?.(event.message ?? "unknown_error");
  if (event.type === "done") {
    handlers.onDone?.({
      body: event.body ?? "",
      phasesUpdated: event.phasesUpdated ?? 0,
      invalidPlan: Boolean(event.invalidPlan),
      messageId: event.messageId,
    });
  }
}

export type {
  Message,
  Phase,
  Project,
  ProjectDetail,
  ProjectSummary,
  Task,
};
