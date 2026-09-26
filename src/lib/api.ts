import type {
  AppSettings,
  MCPServerConfig,
  MCPToolInfo,
  Message,
  Phase,
  PhaseStatus,
  Project,
  ProjectDetail,
  ProjectSummary,
  ProviderSummary,
  SkillConfig,
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

export function createTask(
  phaseId: string,
  input: {
    content: string;
    description?: string | null;
    notes?: string | null;
    done?: boolean;
  },
) {
  return request<{ task: Task }>(`/api/phases/${phaseId}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTask(
  taskId: string,
  patch: {
    content?: string;
    description?: string | null;
    notes?: string | null;
    done?: boolean;
  },
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

/* -------------------------------- MCP servers ------------------------------ */

export function fetchMCPServers() {
  return request<{ servers: MCPServerConfig[] }>("/api/mcp/servers");
}

/** Saves the whole list; each server may carry its per-tool approvals. */
export function saveMCPServers(
  servers: (Partial<MCPServerConfig> & {
    tools?: { toolName: string; autoApprove: boolean }[];
  })[],
) {
  return request<{ servers: MCPServerConfig[] }>("/api/mcp/servers", {
    method: "PUT",
    body: JSON.stringify({ servers }),
  });
}

export function deleteMCPServer(id: string) {
  return request<{ servers: MCPServerConfig[] }>(
    `/api/mcp/servers?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** "Test / List tools": connects and pulls the server's catalogue. */
export async function testMCPServer(
  id: string,
): Promise<{ tools: MCPToolInfo[] } | { error: string }> {
  const response = await fetch(
    `/api/mcp/servers/${encodeURIComponent(id)}/tools`,
  );
  const data = (await response.json().catch(() => ({}))) as {
    tools?: MCPToolInfo[];
    error?: string;
  };
  if (!response.ok) return { error: data.error ?? `http_${response.status}` };
  return { tools: data.tools ?? [] };
}

export function importMCPServers(json: string) {
  return request<{
    servers: Omit<MCPServerConfig, "id">[];
    errors: string[];
  }>("/api/mcp/import", {
    method: "POST",
    body: JSON.stringify({ json }),
  });
}

/* ---------------------------------- skills --------------------------------- */

export function fetchSkills() {
  return request<{ skills: SkillConfig[] }>("/api/skills");
}

export function saveSkills(skills: Partial<SkillConfig>[]) {
  return request<{ skills: SkillConfig[] }>("/api/skills", {
    method: "PUT",
    body: JSON.stringify({ skills }),
  });
}

/** `null` means "no explicit selection" — every enabled skill applies. */
export function fetchProjectSkills(projectId: string) {
  return request<{ skillIds: string[] | null }>(
    `/api/projects/${projectId}/skills`,
  );
}

export function saveProjectSkills(projectId: string, skillIds: string[]) {
  return request<{ skillIds: string[] | null }>(
    `/api/projects/${projectId}/skills`,
    { method: "PUT", body: JSON.stringify({ skillIds }) },
  );
}

/** Answers a pending tool approval so the paused chat stream can continue. */
export function approveToolCall(
  projectId: string,
  callId: string,
  approved: boolean,
) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/chat/approve`, {
    method: "POST",
    body: JSON.stringify({ callId, approved }),
  });
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

/** A tool the agent is running, as shown in the transient activity list. */
export interface ChatToolEvent {
  callId: string;
  name: string;
  toolName?: string;
  serverName?: string;
  args?: string;
}

export interface ChatStreamHandlers {
  onDelta?: (text: string) => void;
  onDone?: (event: {
    body: string;
    phasesUpdated: number;
    invalidPlan: boolean;
    messageId?: string;
  }) => void;
  onError?: (message: string) => void;
  /** Tool activity events — transient, never persisted to the chat history. */
  onToolCall?: (event: ChatToolEvent) => void;
  onToolApprovalRequired?: (event: ChatToolEvent) => void;
  onToolApprovalResolved?: (event: {
    callId: string;
    approved: boolean;
  }) => void;
  onToolResult?: (event: {
    callId: string;
    name: string;
    ok: boolean;
    summary?: string;
  }) => void;
  /** Enabled MCP servers that could not be reached this turn. */
  onToolUnavailable?: (serverNames: string) => void;
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

interface ChatStreamEvent {
  type: string;
  text?: string;
  body?: string;
  phasesUpdated?: number;
  invalidPlan?: boolean;
  message?: string;
  messageId?: string;
  callId?: string;
  name?: string;
  toolName?: string;
  serverName?: string;
  args?: string;
  ok?: boolean;
  summary?: string;
  approved?: boolean;
  servers?: string;
}

function dispatch(event: ChatStreamEvent, handlers: ChatStreamHandlers) {
  switch (event.type) {
    case "delta":
      if (event.text) handlers.onDelta?.(event.text);
      break;
    case "error":
      handlers.onError?.(event.message ?? "unknown_error");
      break;
    case "done":
      handlers.onDone?.({
        body: event.body ?? "",
        phasesUpdated: event.phasesUpdated ?? 0,
        invalidPlan: Boolean(event.invalidPlan),
        messageId: event.messageId,
      });
      break;
    case "tool_call":
    case "tool_approval_required": {
      if (!event.callId) break;
      const payload: ChatToolEvent = {
        callId: event.callId,
        name: event.name ?? "tool",
        toolName: event.toolName,
        serverName: event.serverName,
        args: event.args,
      };
      if (event.type === "tool_call") {
        handlers.onToolCall?.(payload);
      } else {
        handlers.onToolApprovalRequired?.(payload);
      }
      break;
    }
    case "tool_approval_resolved":
      if (event.callId) {
        handlers.onToolApprovalResolved?.({
          callId: event.callId,
          approved: Boolean(event.approved),
        });
      }
      break;
    case "tool_result":
      if (event.callId) {
        handlers.onToolResult?.({
          callId: event.callId,
          name: event.name ?? "tool",
          ok: Boolean(event.ok),
          summary: event.summary,
        });
      }
      break;
    case "tool_unavailable":
      if (event.servers) handlers.onToolUnavailable?.(event.servers);
      break;
  }
}

export type {
  MCPServerConfig,
  MCPToolInfo,
  Message,
  Phase,
  Project,
  ProjectDetail,
  ProjectSummary,
  SkillConfig,
  Task,
};
