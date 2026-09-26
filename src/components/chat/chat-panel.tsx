"use client";

import { AlertTriangle, Loader2, Send, Settings2, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MessageBubble } from "@/components/chat/message-bubble";
import { SkillPicker } from "@/components/chat/skill-picker";
import {
  ToolActivity,
  type ToolActivityItem,
} from "@/components/chat/tool-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  approveToolCall,
  fetchProjectSkills,
  fetchSkills,
  streamChat,
  type ChatToolEvent,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { suggestSkills } from "@/lib/skills";
import type { Message, SkillConfig } from "@/lib/types";

/** The `/slug` fragment right before the caret, when one is being typed. */
function slashQuery(value: string, caret: number): string | null {
  const before = value.slice(0, caret);
  const match = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  return match ? match[1].toLowerCase() : null;
}

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
  /** True when only reconfiguring a provider in Settings can fix the error. */
  const [needsSettings, setNeedsSettings] = useState(false);
  const [local, setLocal] = useState<Message[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivityItem[]>([]);
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [projectSkillIds, setProjectSkillIds] = useState<string[] | null>(null);
  const [suggestions, setSuggestions] = useState<{
    query: string;
    index: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = [...messages, ...local];

  useEffect(() => {
    setLocal([]);
    setToolActivity([]);
    setProjectSkillIds(null);
  }, [projectId]);

  useEffect(() => {
    fetchSkills()
      .then((result) => setSkills(result.skills))
      .catch(() => setSkills([]));
    fetchProjectSkills(projectId)
      .then((result) => setProjectSkillIds(result.skillIds))
      .catch(() => setProjectSkillIds(null));
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, streamingText, toolActivity.length]);

  const enabledSkills = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );

  /** Skills that apply to this project (project override, else all enabled). */
  const scopedSkills = useMemo(() => {
    if (!projectSkillIds || !projectSkillIds.length) return enabledSkills;
    return enabledSkills.filter((skill) => projectSkillIds.includes(skill.id));
  }, [enabledSkills, projectSkillIds]);

  const matches = useMemo(() => {
    if (!suggestions) return [];
    return suggestSkills(skills, projectSkillIds, suggestions.query).slice(0, 6);
  }, [suggestions, skills, projectSkillIds]);

  /** Recomputes the slash suggestions for the current caret position. */
  function refreshSuggestions(value: string, caret: number) {
    const query = slashQuery(value, caret);
    setSuggestions(query === null ? null : { query, index: 0 });
  }

  /** Replaces the half-typed `/query` with the chosen skill's slug. */
  function insertSkill(slug: string) {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/(?:^|\s)\/[a-z0-9-]*$/i, (match) =>
      match.startsWith("/") ? `/${slug} ` : `${match[0]}/${slug} `,
    );
    const next = before + draft.slice(caret);
    setDraft(next);
    setSuggestions(null);
    requestAnimationFrame(() => {
      input?.focus();
      const position = before.length;
      input?.setSelectionRange(position, position);
    });
  }

  /** Chips for skills that are active for this project, plus explicit ones. */
  const chips = useMemo(() => {
    const explicit = /\/([a-z0-9][a-z0-9-]*)/gi;
    const typed = [...draft.matchAll(explicit)]
      .map((match) => match[1].toLowerCase())
      .flatMap((slug) => enabledSkills.filter((skill) => skill.slug === slug));
    const combined = [...scopedSkills, ...typed];
    return combined.filter(
      (skill, index) => combined.findIndex((item) => item.id === skill.id) === index,
    );
  }, [draft, enabledSkills, scopedSkills]);

  async function send(prompt: string, optimistic = true) {
    const text = prompt.trim();
    if (!text || busy) return;

    setError(null);
    setNeedsSettings(false);
    setBusy(true);
    setStreamingText("");
    setToolActivity([]);

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

    /** Merges a tool event into the transient activity list. */
    const upsertTool = (
      event: ChatToolEvent,
      state: ToolActivityItem["state"],
      summary?: string,
    ) => {
      setToolActivity((prev) => {
        const existing = prev.find((item) => item.callId === event.callId);
        if (existing) {
          return prev.map((item) =>
            item.callId === event.callId
              ? {
                  ...item,
                  state,
                  summary: summary ?? item.summary,
                  toolName: event.toolName ?? item.toolName,
                  serverName: event.serverName ?? item.serverName,
                }
              : item,
          );
        }
        return [
          ...prev,
          {
            callId: event.callId,
            name: event.name,
            toolName: event.toolName,
            serverName: event.serverName,
            state,
            summary,
          },
        ];
      });
    };

    try {
      await streamChat(
        projectId,
        { prompt: text, locale },
        {
          onDelta: (chunk) => {
            acc += chunk;
            setStreamingText(acc);
          },
          onToolApprovalRequired: (event) => upsertTool(event, "awaiting"),
          onToolCall: (event) => upsertTool(event, "running"),
          onToolUnavailable: (names) =>
            toast.warning(tr("chat.tools.unavailable", { servers: names })),
          onToolResult: (event) => {
            setToolActivity((prev) =>
              prev.map((item) =>
                item.callId === event.callId
                  ? {
                      ...item,
                      state: event.ok
                        ? "ok"
                        : event.summary === "denied"
                          ? "denied"
                          : "error",
                      summary: event.summary,
                    }
                  : item,
              ),
            );
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
              setNeedsSettings(true);
            } else if (code === "codex_reconnect_required") {
              setError(t.chat.codexReconnect);
              setNeedsSettings(true);
            } else if (code === "tool_permission_denied") {
              setError(t.chat.tools.denied);
              setNeedsSettings(false);
            } else {
              setError(code.startsWith("Provider error") ? code : t.chat.failed);
              setNeedsSettings(false);
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
      // Tool activity is transient: it disappears when the turn ends.
      setToolActivity([]);
    }
  }

  function retry() {
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content, false);
  }

  async function decide(callId: string, approved: boolean) {
    try {
      await approveToolCall(projectId, callId, approved);
    } catch {
      // A timeout / already-settled approval is not worth interrupting for: the
      // agent has moved on either way.
      toast.error(t.chat.failed);
    }
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
        <div className="flex items-center gap-1">
          <SkillPicker
            projectId={projectId}
            skills={skills}
            selected={projectSkillIds}
            onChange={setProjectSkillIds}
          />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">
              <Settings2 className="mr-2 h-4 w-4" />
              {t.nav.settings}
            </Link>
          </Button>
        </div>
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

          <ToolActivity
            items={toolActivity}
            onApprove={(callId) => void decide(callId, true)}
            onDeny={(callId) => void decide(callId, false)}
          />

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
              {needsSettings ? (
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
          setSuggestions(null);
          void send(value);
        }}
      >
        {chips.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5" data-testid="skill-chips">
            {chips.map((skill) => (
              <Badge
                key={skill.id}
                variant="secondary"
                className="gap-1 font-mono text-[10px]"
                data-testid="skill-chip"
              >
                /{skill.slug}
              </Badge>
            ))}
          </div>
        ) : null}

        {suggestions && matches.length ? (
          <div
            className="mb-2 overflow-hidden rounded-lg border bg-popover shadow-sm"
            data-testid="slash-suggestions"
          >
            {matches.map((skill, index) => (
              <button
                key={skill.id}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent ${
                  index === suggestions.index ? "bg-accent" : ""
                }`}
                onClick={() => insertSkill(skill.slug)}
                data-testid="slash-suggestion"
              >
                <span className="font-mono text-muted-foreground">
                  /{skill.slug}
                </span>
                <span className="truncate">{skill.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              refreshSuggestions(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              );
            }}
            onClick={(event) =>
              refreshSuggestions(
                draft,
                (event.target as HTMLTextAreaElement).selectionStart ?? draft.length,
              )
            }
            onKeyDown={(event) => {
              if (suggestions && matches.length) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSuggestions({
                    ...suggestions,
                    index: (suggestions.index + 1) % matches.length,
                  });
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSuggestions({
                    ...suggestions,
                    index: (suggestions.index - 1 + matches.length) % matches.length,
                  });
                  return;
                }
                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  insertSkill(matches[suggestions.index]?.slug ?? matches[0].slug);
                  return;
                }
                if (event.key === "Escape") {
                  setSuggestions(null);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const value = draft;
                setDraft("");
                setSuggestions(null);
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
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {enabledSkills.length ? t.chat.skills.slashHint : ""}
          </p>
          {!hasProvider ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {tr("chat.noProvider")}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
