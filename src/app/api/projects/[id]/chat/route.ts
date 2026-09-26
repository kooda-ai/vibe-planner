import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai";
import { runAgentTurn } from "@/lib/ai/agent";
import { ensureFreshCodexAuth } from "@/lib/ai/codex-token";
import { buildChatMessages } from "@/lib/ai/prompt";
import { ProviderError, type ChatMessage } from "@/lib/ai/types";
import {
  addMessage,
  applyPlan,
  getProjectDetail,
  getSettingsRecord,
} from "@/lib/db";
import { collectTools, type NamespacedTool } from "@/lib/mcp/tools";
import { extractPlan } from "@/lib/parse-phases";
import {
  isCodexProvider,
  parseMCPServers,
  parseSkills,
  parseToolPermissions,
  pickProvider,
  readProjectSkillSelection,
  readProviders,
  SETTINGS_KEYS,
} from "@/lib/settings";
import { resolveActiveSkills } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

interface StreamEvent {
  type:
    | "delta"
    | "done"
    | "error"
    | "tool_call"
    | "tool_result"
    | "tool_unavailable"
    | "tool_approval_required"
    | "tool_approval_resolved";
  text?: string;
  body?: string;
  phasesUpdated?: number;
  invalidPlan?: boolean;
  message?: string;
  messageId?: string;
  /* tool activity (transient — never persisted) */
  callId?: string;
  name?: string;
  toolName?: string;
  serverName?: string;
  args?: string;
  ok?: boolean;
  summary?: string;
  approved?: boolean;
  /** Failing server names, joined for display. */
  servers?: string;
}

/**
 * Streams an AI answer, hides the trailing ```json block from the viewer, then
 * applies the parsed plan to the project's phases.
 *
 * Answers may involve MCP tools: the agent loop runs them and reports each step
 * as a transient event so the UI can show live tool activity. Approvals pause
 * the loop until `POST .../chat/approve` answers.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: unknown;
    locale?: unknown;
    providerId?: unknown;
    model?: unknown;
  };

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt_required" }, { status: 400 });
  }

  const detail = await getProjectDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const locale = body.locale === "en" ? "en" : "tr";

  const record = await getSettingsRecord();
  const providers = await readProviders();
  const choice = pickProvider(
    providers,
    record,
    typeof body.providerId === "string" ? body.providerId : null,
    typeof body.model === "string" ? body.model : null,
  );

  if (!choice) {
    return NextResponse.json({ error: "no_provider_configured" }, { status: 400 });
  }

  // Codex logins carry an OAuth token instead of an API key; refresh it here so
  // an expired session is renewed silently before the request goes out.
  let credential = choice.provider.apiKey;
  let accountId: string | undefined;
  if (isCodexProvider(choice.provider)) {
    try {
      const auth = await ensureFreshCodexAuth(choice.provider);
      credential = auth.accessToken;
      accountId = auth.accountId;
    } catch (error) {
      // The stored session is dead and could not be renewed — the only fix is
      // to link the account again, so the UI gets a code it can explain.
      return NextResponse.json(
        { error: "codex_reconnect_required" },
        { status: error instanceof ProviderError ? error.status : 502 },
      );
    }
  } else if (!credential) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
  }

  const servers = parseMCPServers(record[SETTINGS_KEYS.mcpServers]);
  const permissions = parseToolPermissions(record[SETTINGS_KEYS.toolPermissions]);
  const skills = parseSkills(record[SETTINGS_KEYS.skills]);
  const projectSkillIds = await readProjectSkillSelection(id);
  const activeSkills = resolveActiveSkills({
    skills,
    projectSkillIds,
    prompt,
  });

  const history: ChatMessage[] = detail.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const messages = buildChatMessages({
    project: detail.project,
    phases: detail.phases,
    history,
    prompt,
    locale,
    skills: activeSkills,
  });

  // Collect MCP tools up front. A server that fails to connect is skipped and
  // reported, so a broken MCP config never blocks a normal chat.
  const collected = await collectTools(servers);
  const tools: NamespacedTool[] = collected.tools;
  const autoApproved = new Set(
    tools.filter((tool) => permissions[tool.name] === true).map((tool) => tool.name),
  );

  await addMessage({ projectId: id, role: "user", content: prompt });

  const provider = getProvider(choice.provider.type);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let raw = "";

      // A server that cannot be reached is non-fatal, but the user should know
      // those tools are missing from this turn.
      if (collected.failures.length) {
        send({
          type: "tool_unavailable",
          servers: collected.failures.map((failure) => failure.serverName).join(", "),
        });
      }

      try {
        for await (const event of runAgentTurn({
          provider,
          streamOptions: {
            apiKey: credential,
            baseUrl: choice.provider.baseUrl,
            model: choice.model,
            messages,
            accountId,
            signal: request.signal,
          },
          tools,
          servers,
          autoApproved,
          signal: request.signal,
        })) {
          switch (event.type) {
            case "delta":
              send({ type: "delta", text: event.text });
              break;
            case "final":
              raw = event.text;
              break;
            case "tool_call":
              send({
                type: "tool_call",
                callId: event.callId,
                name: event.name,
                toolName: event.toolName,
                serverName: event.serverName,
                args: event.args,
              });
              break;
            case "tool_approval_required":
              send({
                type: "tool_approval_required",
                callId: event.callId,
                name: event.name,
                toolName: event.toolName,
                serverName: event.serverName,
                args: event.args,
              });
              break;
            case "tool_approval_resolved":
              send({
                type: "tool_approval_resolved",
                callId: event.callId,
                approved: event.approved,
              });
              break;
            case "tool_result":
              send({
                type: "tool_result",
                callId: event.callId,
                name: event.name,
                ok: event.ok,
                summary: event.summary,
              });
              break;
          }
        }
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        const message =
          error instanceof Error ? error.message : "provider_error";
        await addMessage({
          projectId: id,
          role: "assistant",
          content: `⚠️ ${message}`,
        });
        send({ type: "error", message });
        controller.close();
        return;
      }

      // The agent's `final` event carries the complete answer, hidden plan
      // block included, so the plan can be applied exactly as before.
      const { plan, invalid, body: visibleBody } = extractPlan(raw);

      let phasesUpdated = 0;
      if (plan) {
        const result = await applyPlan(id, plan);
        phasesUpdated = result.created + result.updated;
      }

      const assistantMessage = await addMessage({
        projectId: id,
        role: "assistant",
        content: visibleBody,
        ...(phasesUpdated ? { phasesUpdated } : {}),
      });

      send({
        type: "done",
        body: visibleBody,
        phasesUpdated,
        invalidPlan: invalid,
        messageId: assistantMessage.id,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
