"use client";

import { AlertTriangle, ChevronDown, Loader2, Send, Settings2, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/chat/message-bubble";
import { QuestionGroup, type QuestionGroupData } from "@/components/chat/question-group";
import { SkillPicker } from "@/components/chat/skill-picker";
import { ToolActivity, type ToolActivityItem } from "@/components/chat/tool-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { approveToolCall, fetchProjectSkills, fetchSkills, streamChat, type ChatToolEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { suggestSkills } from "@/lib/skills";
import type { Message, SkillConfig } from "@/lib/types";

function slashQuery(value: string, caret: number): string | null {
  const match = value.slice(0, caret).match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function ChatPanel({ projectId, projectName, messages, loading, hasProvider, onPlanApplied }: {
  projectId: string; projectName: string; messages: Message[]; loading: boolean; hasProvider: boolean; onPlanApplied: () => void;
}) {
  const { t, tr, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [local, setLocal] = useState<Message[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivityItem[]>([]);
  const [planningStatus, setPlanningStatus] = useState("");
  const [phaseDraft, setPhaseDraft] = useState<string[]>([]);
  const [questionGroup, setQuestionGroup] = useState<QuestionGroupData | null>(null);
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [projectSkillIds, setProjectSkillIds] = useState<string[] | null>(null);
  const [suggestions, setSuggestions] = useState<{ query: string; index: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const history = [...messages, ...local];

  useEffect(() => { setLocal([]); setToolActivity([]); setProjectSkillIds(null); }, [projectId]);
  useEffect(() => {
    fetchSkills().then((result) => setSkills(result.skills)).catch(() => setSkills([]));
    fetchProjectSkills(projectId).then((result) => setProjectSkillIds(result.skillIds)).catch(() => setProjectSkillIds(null));
  }, [projectId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [history.length, streamingText, toolActivity.length]);

  const enabledSkills = useMemo(() => skills.filter((skill) => skill.enabled), [skills]);
  const scopedSkills = useMemo(() => !projectSkillIds || !projectSkillIds.length ? enabledSkills : enabledSkills.filter((skill) => projectSkillIds.includes(skill.id)), [enabledSkills, projectSkillIds]);
  const matches = useMemo(() => suggestions ? suggestSkills(skills, projectSkillIds, suggestions.query).slice(0, 6) : [], [suggestions, skills, projectSkillIds]);
  function refreshSuggestions(value: string, caret: number) {
    const query = slashQuery(value, caret);
    setSuggestions(query === null ? null : { query, index: 0 });
  }
  function insertSkill(slug: string) {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/(?:^|\s)\/[a-z0-9-]*$/i, (match) => match.startsWith("/") ? `/${slug} ` : `${match[0]}/${slug} `);
    const next = before + draft.slice(caret);
    setDraft(next); setSuggestions(null);
    requestAnimationFrame(() => { input?.focus(); const position = before.length; input?.setSelectionRange(position, position); });
  }
  const chips = useMemo(() => {
    const explicit = /\/([a-z0-9][a-z0-9-]*)/gi;
    const typed = [...draft.matchAll(explicit)].map((match) => match[1].toLowerCase()).flatMap((slug) => enabledSkills.filter((skill) => skill.slug === slug));
    const combined = [...scopedSkills, ...typed];
    return combined.filter((skill, index) => combined.findIndex((item) => item.id === skill.id) === index);
  }, [draft, enabledSkills, scopedSkills]);

  async function send(prompt: string, optimistic = true) {
    const text = prompt.trim();
    if (!text || busy) return;
    setError(null); setNeedsSettings(false); setBusy(true); setStreamingText(""); setToolActivity([]);
    const userMessage: Message = { id: `local-user-${Date.now()}`, projectId, role: "user", content: text, createdAt: new Date().toISOString() };
    if (optimistic) setLocal((prev) => [...prev, userMessage]);
    const controller = new AbortController(); abortRef.current = controller;
    let acc = "";
    const upsertTool = (event: ChatToolEvent, state: ToolActivityItem["state"], summary?: string) => setToolActivity((prev) => {
      const existing = prev.find((item) => item.callId === event.callId);
      if (existing) return prev.map((item) => item.callId === event.callId ? { ...item, state, summary: summary ?? item.summary, toolName: event.toolName ?? item.toolName, serverName: event.serverName ?? item.serverName } : item);
      return [...prev, { callId: event.callId, name: event.name, toolName: event.toolName, serverName: event.serverName, state, summary }];
    });
    try {
      await streamChat(projectId, { prompt: text, locale }, {
        onDelta: (chunk) => { acc += chunk; setStreamingText(acc); }, onStage: ({ status }) => setPlanningStatus(status), onPhaseDraft: setPhaseDraft,
        onQuestionGroup: (group) => { if (group && typeof group === "object" && "questions" in group && Array.isArray((group as QuestionGroupData).questions)) setQuestionGroup(group as QuestionGroupData); },
        onToolApprovalRequired: (event) => upsertTool(event, "awaiting"), onToolCall: (event) => upsertTool(event, "running"),
        onToolUnavailable: (names) => toast.warning(tr("chat.tools.unavailable", { servers: names })),
        onToolResult: (event) => setToolActivity((prev) => prev.map((item) => item.callId === event.callId ? { ...item, state: event.ok ? "ok" : event.summary === "denied" ? "denied" : "error", summary: event.summary } : item)),
        onDone: (event) => { const assistant: Message = { id: event.messageId ?? `local-assistant-${Date.now()}`, projectId, role: "assistant", content: event.body, createdAt: new Date().toISOString(), ...(event.phasesUpdated ? { phasesUpdated: event.phasesUpdated } : {}) }; setLocal((prev) => [...prev, assistant]); setStreamingText(null); if (event.phasesUpdated) onPlanApplied(); if (event.invalidPlan) toast.warning(t.chat.noPlan); },
        onError: (code) => { setStreamingText(null); if (code === "no_provider_configured" || code === "missing_api_key") { setError(t.chat.noProvider); setNeedsSettings(true); } else if (code === "codex_reconnect_required") { setError(t.chat.codexReconnect); setNeedsSettings(true); } else if (code === "invalid_api_key" || code.includes("ByteString")) { setError(t.chat.invalidApiKey); setNeedsSettings(true); } else if (code === "fetch failed" || code === "Failed to fetch") { setError(t.chat.connectionFailed); setNeedsSettings(false); } else if (code === "tool_permission_denied") { setError(t.chat.tools.denied); setNeedsSettings(false); } else { setError(code.startsWith("Provider error") ? code : t.chat.failed); setNeedsSettings(false); } },
      }, controller.signal);
    } catch (streamError) {
      setStreamingText(null);
      if (!controller.signal.aborted) setError(streamError instanceof TypeError && streamError.message === "Failed to fetch" ? t.chat.connectionFailed : streamError instanceof Error ? streamError.message : t.chat.failed);
    } finally { setBusy(false); abortRef.current = null; setToolActivity([]); }
  }
  function retry() { const lastUser = [...history].reverse().find((message) => message.role === "user"); if (lastUser) void send(lastUser.content, false); }
  async function decide(callId: string, approved: boolean) { await approveToolCall(projectId, callId, approved); }

  return <section className="flex h-full min-h-0 flex-col">
    <div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">{t.chat.title}</h2><p className="text-xs text-muted-foreground">{projectName}</p></div><div className="flex items-center gap-1"><SkillPicker projectId={projectId} skills={skills} selected={projectSkillIds} onChange={setProjectSkillIds} /><Button variant="ghost" size="sm" asChild><Link href="/settings"><Settings2 className="mr-2 h-4 w-4" />{t.nav.settings}</Link></Button></div></div>
    <ScrollArea className="flex-1"><div className="space-y-5 p-4">
      {loading ? <div className="space-y-4"><Skeleton className="h-16 w-3/4 rounded-2xl" /><Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" /></div> : history.length === 0 && streamingText === null ? <Card className="border-dashed"><CardContent className="flex flex-col items-center gap-2 py-10 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span><h3 className="text-sm font-medium">{t.chat.emptyTitle}</h3><p className="max-w-sm text-xs text-muted-foreground">{t.chat.emptyDescription}</p><p className="mt-1 text-xs text-muted-foreground/80">{t.chat.emptyHint}</p></CardContent></Card> : null}
      {history.map((message) => <MessageBubble key={message.id} role={message.role} content={message.content} phasesUpdated={message.phasesUpdated} onRetry={message.role === "assistant" && !busy ? retry : undefined} />)}
      {phaseDraft.length ? <div className="rounded-lg border border-dashed p-3 text-sm" aria-label={locale === "tr" ? "Faz başlığı taslağı" : "Draft phase titles"}><p className="mb-2 font-medium">{locale === "tr" ? "Faz başlıkları taslağı" : "Draft phase titles"}</p><ol className="list-inside list-decimal text-muted-foreground">{phaseDraft.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}</ol></div> : null}
      {planningStatus ? <Collapsible className="rounded-md border px-3 py-2"><CollapsibleTrigger aria-label={t.chat.showProgressDetails} className="flex w-full items-center justify-between text-xs text-muted-foreground"><span>{planningStatus}</span><ChevronDown className="h-4 w-4" /></CollapsibleTrigger><CollapsibleContent className="pt-2 text-xs text-muted-foreground">{planningStatus}</CollapsibleContent></Collapsible> : null}
      {questionGroup ? <QuestionGroup group={questionGroup} onSubmit={(answer) => { setQuestionGroup(null); void send(answer); }} /> : null}
      <ToolActivity items={toolActivity} onApprove={(callId) => void decide(callId, true)} onDeny={(callId) => void decide(callId, false)} />
      {busy ? <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t.chat.thinking}</div> : null}
      {streamingText !== null ? <MessageBubble role="assistant" content={streamingText} streaming /> : null}
      {error ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="chat-error"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>{needsSettings ? <Button size="sm" variant="outline" asChild><Link href="/settings">{t.nav.settings}</Link></Button> : <Button size="sm" variant="outline" onClick={retry}>{t.common.retry}</Button>}</div> : null}
      <div ref={bottomRef} />
    </div></ScrollArea>
    <form className="border-t p-3" onSubmit={(event) => { event.preventDefault(); const value = draft; setDraft(""); setSuggestions(null); void send(value); }}>
      <div className="flex items-end gap-2"><Textarea ref={inputRef} data-testid="chat-input" value={draft} onChange={(event) => { setDraft(event.target.value); refreshSuggestions(event.target.value, event.target.selectionStart); }} placeholder={t.chat.placeholder} disabled={!hasProvider || busy} />{busy ? <Button type="button" size="icon" aria-label={t.chat.stop} onClick={() => abortRef.current?.abort()}><Square className="h-4 w-4" /></Button> : <Button type="submit" size="icon" disabled={!hasProvider || !draft.trim()} aria-label={t.chat.send}><Send className="h-4 w-4" /></Button>}</div>
      {chips.length ? <div className="mt-2 flex flex-wrap gap-1">{chips.map((skill) => <Badge key={skill.id} variant="secondary">/{skill.slug}</Badge>)}</div> : null}
      {matches.length ? <div data-testid="slash-suggestions" className="mt-2 rounded-md border p-1">{matches.map((skill) => <button key={skill.id} type="button" data-testid="slash-suggestion" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => insertSkill(skill.slug)}>/{skill.slug} — {skill.name}</button>)}</div> : null}
    </form>
  </section>;
}
