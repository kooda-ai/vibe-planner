import http from "node:http";

import {
  OAUTH_PORT,
  REDIRECT_URI,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generatePkce,
  generateState,
  type CodexPkce,
  type CodexTokens,
} from "./codex-oauth";

/**
 * Temporary HTTP listener on port 1455 that receives the ChatGPT OAuth
 * redirect. The redirect URI is fixed by the client registration, so the app
 * has to expose that exact port while a login is in flight.
 *
 * The listener and the pending/result maps live on `globalThis` so that the
 * `/api/oauth/codex/start` and `/api/oauth/codex/status` route bundles (and the
 * dev server's hot reloads) all share one instance.
 */

const GLOBAL_KEY = "__vibePlannerCodexOAuth";

export type CodexAuthResult =
  | { status: "pending" }
  | { status: "expired" }
  | {
      status: "connected";
      tokens: CodexTokens;
      accountId?: string;
      email?: string;
    }
  | { status: "error"; message: string };

interface PendingAuth {
  pkce: CodexPkce;
  createdAt: number;
  result: CodexAuthResult | null;
}

interface CodexOAuthState {
  server: http.Server | null;
  listening: boolean;
  pending: Map<string, PendingAuth>;
}

/** How long a started login may wait for the browser round-trip. */
const TIMEOUT_MS = 5 * 60 * 1000;

function state(): CodexOAuthState {
  const holder = globalThis as unknown as Record<string, CodexOAuthState | undefined>;
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = {
      server: null,
      listening: false,
      pending: new Map(),
    };
  }
  return holder[GLOBAL_KEY];
}

function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of state().pending) {
    if (now - entry.createdAt > TIMEOUT_MS) {
      if (!entry.result || entry.result.status === "pending") {
        entry.result = {
          status: "error",
          message: "OAuth callback timeout - authorization took too long",
        };
      }
      // Keep the (now failed) entry briefly so the pending poll can report it.
      if (now - entry.createdAt > TIMEOUT_MS + 60_000) {
        state().pending.delete(key);
      }
    }
  }
}

function htmlPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
             display: flex; min-height: 100vh; margin: 0; align-items: center;
             justify-content: center; background: #0f1115; color: #e6e8ee; }
      main { max-width: 32rem; padding: 2.5rem; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
      p { margin: 0; color: #9ba3b4; line-height: 1.5; font-size: .95rem; }
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

async function handleCallback(url: URL): Promise<{
  status: number;
  body: string;
}> {
  const code = url.searchParams.get("code");
  const incomingState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const entry = incomingState ? state().pending.get(incomingState) : undefined;

  if (!entry) {
    return {
      status: 400,
      body: htmlPage(
        "Authorization failed",
        "Unknown or expired login attempt. Start the connection again from Settings.",
      ),
    };
  }

  if (error) {
    const message = errorDescription || error;
    entry.result = { status: "error", message };
    return { status: 400, body: htmlPage("Authorization failed", message) };
  }

  if (!code) {
    const message = "Missing authorization code";
    entry.result = { status: "error", message };
    return { status: 400, body: htmlPage("Authorization failed", message) };
  }

  try {
    const tokens = await exchangeCodeForTokens(code, entry.pkce);
    entry.result = { status: "connected", tokens };
    return {
      status: 200,
      body: htmlPage(
        "Authorization successful",
        "You can close this window and return to the planner.",
      ),
    };
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error
        ? exchangeError.message
        : "Token exchange failed";
    entry.result = { status: "error", message };
    return { status: 400, body: htmlPage("Authorization failed", message) };
  }
}

function requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", REDIRECT_URI);
  const send = (status: number, body: string) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  };

  if (url.pathname === "/auth/callback") {
    void handleCallback(url)
      .then(({ status, body }) => send(status, body))
      .catch(() =>
        send(500, htmlPage("Authorization failed", "Unexpected server error.")),
      );
    return;
  }

  if (url.pathname === "/cancel") {
    send(200, htmlPage("Login cancelled", "You can close this window."));
    return;
  }

  send(404, htmlPage("Not found", "Nothing to see here."));
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${OAUTH_PORT} is already in use, so the ChatGPT login callback cannot start. Close whatever is using it and try again.`,
          ),
        );
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(OAUTH_PORT, "127.0.0.1");
  });
}

async function ensureServer(): Promise<void> {
  const current = state();
  if (current.listening && current.server) return;

  const server = current.server ?? http.createServer(requestHandler);
  current.server = server;
  await listen(server);
  current.listening = true;
}

/** Starts a login and returns the URL the user has to open in a browser. */
export async function startCodexOAuth(): Promise<{
  authUrl: string;
  state: string;
}> {
  await ensureServer();
  sweep();

  const pkce = generatePkce();
  const authState = generateState();
  state().pending.set(authState, {
    pkce,
    createdAt: Date.now(),
    result: { status: "pending" },
  });

  return {
    authUrl: buildAuthorizeUrl(pkce, authState),
    state: authState,
  };
}

/** Reads the current outcome of a login attempt. */
export function getCodexAuthResult(authState: string): CodexAuthResult {
  sweep();
  const entry = state().pending.get(authState);
  if (!entry) return { status: "expired" };
  return entry.result ?? { status: "pending" };
}
