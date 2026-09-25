"use client";

import { Check, Copy, RotateCcw, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

export function MessageBubble({
  role,
  content,
  phasesUpdated,
  streaming,
  onRetry,
}: {
  role: Message["role"];
  content: string;
  phasesUpdated?: number;
  streaming?: boolean;
  onRetry?: () => void;
}) {
  const { t, tr } = useI18n();
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.copyFailed);
    }
  }

  return (
    <div
      className={cn("group flex gap-3", isUser ? "justify-end" : "justify-start")}
      data-testid={isUser ? "message-user" : "message-assistant"}
    >
      {!isUser ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      ) : null}

      <div className={cn("max-w-[85%] space-y-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted",
          )}
          data-testid="message-content"
        >
          {content}
          {streaming ? (
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-current align-middle" />
          ) : null}
        </div>

        {!isUser && phasesUpdated ? (
          <p
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            data-testid="phases-updated-badge"
          >
            <Check className="h-3.5 w-3.5" />
            {tr("chat.phasesUpdated", { count: phasesUpdated })}
          </p>
        ) : null}

        {!streaming && content ? (
          <div
            className={cn(
              "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={copy}
              data-testid="copy-message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            {onRetry ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onRetry}
                data-testid="retry-message"
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {t.chat.retry}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );
}
