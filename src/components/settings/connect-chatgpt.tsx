"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { pollCodexStatus, startCodexLogin } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ProviderSummary } from "@/lib/types";

/** How often the page asks the server whether the login round-trip finished. */
const POLL_INTERVAL_MS = 2000;
/** Give up after ~5 minutes, matching the server-side callback timeout. */
const MAX_POLLS = 150;

type Phase = "idle" | "connecting" | "error";

/**
 * Button + polling loop for the ChatGPT (Codex) login. Tokens never reach the
 * browser: the server stores them and this component only learns the linked
 * account's e-mail.
 */
export function ConnectChatGpt({
  onConnected,
  compact = false,
}: {
  onConnected?: (provider: ProviderSummary) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  function fail(message: string) {
    stopPolling();
    setPhase("error");
    setError(message);
  }

  async function connect() {
    setError(null);
    setPhase("connecting");

    let state: string;
    let authUrl: string;
    try {
      const started = await startCodexLogin();
      state = started.state;
      authUrl = started.authUrl;
    } catch (startError) {
      fail(
        startError instanceof Error ? startError.message : t.settings.connectFailed,
      );
      return;
    }

    window.open(authUrl, "_blank", "noopener,noreferrer");

    let polls = 0;
    stopPolling();
    timerRef.current = window.setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) {
        fail(t.settings.connectTimeout);
        return;
      }
      void pollCodexStatus(state)
        .then((result) => {
          if (result.status === "pending") return;
          stopPolling();
          if (result.status === "connected") {
            setPhase("idle");
            setAccountEmail(result.provider.accountEmail ?? "");
            toast.success(t.settings.connected);
            onConnected?.(result.provider);
            return;
          }
          if (result.status === "expired") {
            fail(t.settings.connectExpired);
            return;
          }
          fail(result.message || t.settings.connectFailed);
        })
        .catch(() => {
          // A transient poll failure is not fatal — the next tick retries.
        });
    }, POLL_INTERVAL_MS);
  }

  if (phase === "connecting" && compact) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-muted-foreground"
        data-testid="codex-connecting"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t.settings.connecting}
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <Button
        type="button"
        variant={compact ? "outline" : "default"}
        size={compact ? "sm" : "default"}
        onClick={() => void connect()}
        disabled={phase === "connecting"}
        data-testid="codex-connect-button"
        data-state={phase}
      >
        {phase === "connecting" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {accountEmail !== null
          ? t.settings.reconnect
          : t.settings.connectChatgpt}
      </Button>

      {phase === "connecting" ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="codex-connecting"
        >
          {t.settings.connecting}
        </p>
      ) : null}

      {accountEmail !== null && phase !== "connecting" ? (
        <p
          className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
          data-testid="codex-connected"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {accountEmail
            ? t.settings.connectedAs.replace("{email}", accountEmail)
            : t.settings.connectedNoEmail}
        </p>
      ) : null}

      {phase === "error" && error ? (
        <div
          className="flex items-start gap-1 text-xs text-destructive"
          data-testid="codex-error"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!compact ? (
        <p className="text-xs text-muted-foreground">{t.settings.connectHint}</p>
      ) : null}
    </div>
  );
}

