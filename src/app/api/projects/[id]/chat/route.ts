import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai";
import { ensureFreshCodexAuth } from "@/lib/ai/codex-token";
import { buildChatMessages } from "@/lib/ai/prompt";
import { ProviderError, type ChatMessage } from "@/lib/ai/types";
import {
  addMessage,
  applyPlan,
  getProjectDetail,
  getSettingsRecord,
} from "@/lib/db";
import { extractPlan } from "@/lib/parse-phases";
import { visiblePrefix } from "@/lib/plan-block";
import { isCodexProvider, pickProvider, readProviders } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

interface StreamEvent {
  type: "delta" | "done" | "error";
  text?: string;
  body?: string;
  phasesUpdated?: number;
  invalidPlan?: boolean;
  message?: string;
  messageId?: string;
}

/**
 * Streams an AI answer, hides the trailing ```json block from the viewer, then
 * applies the parsed plan to the project's phases.
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
  });

  await addMessage({ projectId: id, role: "user", content: prompt });

  const provider = getProvider(choice.provider.type);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let raw = "";
      let visibleLength = 0;

      try {
        for await (const chunk of provider.chatStream({
          apiKey: credential,
          baseUrl: choice.provider.baseUrl,
          model: choice.model,
          messages,
          accountId,
          signal: request.signal,
        })) {
          raw += chunk;
          // The structured plan is only for the machine: forward the prose up
          // to the point where the hidden block begins and nothing after it.
          const visible = visiblePrefix(raw);
          if (visible.length > visibleLength) {
            send({ type: "delta", text: visible.slice(visibleLength) });
            visibleLength = visible.length;
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
