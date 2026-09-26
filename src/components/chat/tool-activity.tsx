"use client";

import { Check, Loader2, ShieldQuestion, Wrench, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** One live tool call; these rows are transient and never persisted. */
export interface ToolActivityItem {
  callId: string;
  name: string;
  toolName?: string;
  serverName?: string;
  /** awaiting → still needs the user's decision. */
  state: "awaiting" | "running" | "ok" | "error" | "denied";
  summary?: string;
}

/**
 * Live tool activity for the running chat turn.
 *
 * Every row disappears once the turn finishes (the parent clears the list), so
 * tool calls leave no trace in the stored conversation.
 */
export function ToolActivity({
  items,
  onApprove,
  onDeny,
  disabled,
}: {
  items: ToolActivityItem[];
  onApprove: (callId: string) => void;
  onDeny: (callId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  if (!items.length) return null;

  return (
    <div
      className="space-y-2 rounded-xl border border-dashed bg-muted/30 p-3"
      data-testid="tool-activity"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" />
        {t.chat.tools.title}
      </p>
      {items.map((item) => {
        const label = item.toolName ?? item.name;
        return (
          <div
            key={item.callId}
            className="space-y-1.5 rounded-lg border bg-background px-2.5 py-2"
            data-testid="tool-activity-row"
            data-state={item.state}
          >
            <div className="flex items-center gap-2">
              {item.state === "awaiting" ? (
                <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : item.state === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : item.state === "ok" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {label}
              </span>
              {item.serverName ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.serverName}
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 text-xs",
                  item.state === "error" || item.state === "denied"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
                data-testid="tool-activity-state"
              >
                {item.state === "awaiting"
                  ? t.chat.tools.awaiting
                  : item.state === "running"
                    ? t.chat.tools.running
                    : item.state === "ok"
                      ? t.chat.tools.done
                      : item.state === "denied"
                        ? t.chat.tools.denied
                        : t.chat.tools.failed}
              </span>
            </div>

            {item.summary && item.state !== "awaiting" ? (
              <p className="truncate text-xs text-muted-foreground">
                {item.summary}
              </p>
            ) : null}

            {item.state === "awaiting" ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onApprove(item.callId)}
                  disabled={disabled}
                  data-testid="tool-approve"
                >
                  {t.chat.tools.approve}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onDeny(item.callId)}
                  disabled={disabled}
                  data-testid="tool-deny"
                >
                  {t.chat.tools.deny}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
