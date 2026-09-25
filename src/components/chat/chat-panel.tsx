"use client";

import { AlertTriangle, Loader2, Send, Settings2, Square, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MessageBubble } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { streamChat } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Message } from "@/lib/types";

export function ChatPanel({
  projectId,
  projectName,
  messages,
  loading,
  hasProvider,
  onPlanApplied,
}: {
  projectId: string;
  projectName: string;
  messages: Message[];
  loading: boolean;
  hasProvider: boolean;
  onPlanApplied: () => void;
}) {
  const { t, tr, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = [...messages, ...local];

  useEffect(() => {
    setLocal([]);
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, streamingText]);

  async function send(prompt: string, optimistic = true) {
    const text = prompt.trim();
    if (!text || busy) return;

    setError(null);
    setBusy(true);
    setStreamingText("");

    const userMessage: Message = {
      id: `local-user-${Date.now()}`,
      projectId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    if (optimistic) setLocal((prev) => [...prev, userMessage]);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";

    try {
      await streamChat(
        projectId,
        { prompt: text, locale },
        {
          onDelta: (chunk) => {
            acc += chunk;
            setStreamingText(acc);
          },
          onDone: (event) => {
            const assistant: Message = {
              id: event.messageId ?? `local-assistant-${Date.now()}`,
              projectId,
              role: "assistant",
              content: event.body,
              createdAt: new Date().toISOString(),
              ...(event.phasesUpdated ? { phasesUpdated: event.phasesUpdated } : {}),
            };
            setLocal((prev) => [...prev, assistant]);
            setStreamingText(null);
            if (event.phasesUpdated) onPlanApplied();
            if (event.invalidPlan) toast.warning(t.chat.noPlan);
          },
          onError: (code) => {
            setStreamingText(null);
            if (code === "no_provider_configured" || code === "missing_api_key") {
              setError(t.chat.noProvider);
            } else {
              setError(code.startsWith("Provider error") ? code : t.chat.failed);
            }
          },
        },
        controller.signal,
      );
    } catch (streamError) {
      setStreamingText(null);
      if (!controller.signal.aborted) {
        setError(
          streamError instanceof Error ? streamError.message : t.chat.failed,
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function retry() {
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content, false);
  }

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t.chat.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {projectName} · {t.chat.subtitle}
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings">
            <Settings2 className="mr-2 h-4 w-4" />
            {t.nav.settings}
          </Link>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-3/4 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
            </div>
          ) : history.length === 0 && streamingText === null ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-medium">{t.chat.emptyTitle}</h3>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {t.chat.emptyDescription}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  {t.chat.emptyHint}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {history.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              phasesUpdated={message.phasesUpdated}
              onRetry={
                message.role === "assistant" && !busy ? () => retry() : undefined
              }
            />
          ))}

          {streamingText !== null ? (
            <MessageBubble role="assistant" content={streamingText} streaming />
          ) : busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t.chat.thinking}
            </div>
          ) : null}

          {error ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              data-testid="chat-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              {error === t.chat.noProvider ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/settings">{t.nav.settings}</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={retry}>
                  {t.common.retry}
                </Button>
              )}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft;
          setDraft("");
          void send(value);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const value = draft;
                setDraft("");
                void send(value);
              }
            }}
            placeholder={t.chat.placeholder}
            rows={2}
            className="min-h-[44px] resize-none text-sm"
            data-testid="chat-input"
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => abortRef.current?.abort()}
              aria-label={t.chat.stop}
              data-testid="chat-stop"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11"
              disabled={!draft.trim()}
              aria-label={t.chat.send}
              data-testid="chat-send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!hasProvider ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {tr("chat.noProvider")}
          </p>
        ) : null}
      </form>
    </div>
  );
}
