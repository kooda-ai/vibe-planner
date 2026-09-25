import crypto from "node:crypto";

/**
 * ChatGPT (Codex) OAuth helpers.
 *
 * This mirrors the OAuth flow the Codex CLI uses. It is NOT an officially
 * supported developer login: it relies on a fixed public client id registered
 * for the Codex CLI, so OpenAI may change or block it at any time. Everything
 * that touches this flow lives in this module (and `codex-auth-server.ts` /
 * `codex.ts`) so a change is a one-file fix.
 */

/** Fixed public client id of the Codex CLI (no client secret — PKCE only). */
export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const ISSUER = "https://auth.openai.com";

/** The callback URL is hard-coded by the client registration. */
export const OAUTH_PORT = 1455;
export const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/auth/callback`;

/** Sent as both the authorize-URL param and the API `originator` header. */
export const ORIGINATOR = "codex_cli_rs";

const CODEX_API_BASE = "https://chatgpt.com/backend-api/codex";
const CODEX_API_BASE_EU = "https://eu.chatgpt.com/backend-api/codex";

export interface CodexPkce {
  verifier: string;
  challenge: string;
}

export interface CodexTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  /** Lifetime of the access token in seconds. */
  expiresIn?: number;
}

export interface CodexIdTokenClaims {
  chatgpt_account_id?: string;
  chatgpt_account_residency?: string;
  organizations?: { id?: string }[];
  email?: string;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
    chatgpt_account_residency?: string;
    email?: string;
  };
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkce(): CodexPkce {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function buildAuthorizeUrl(
  pkce: CodexPkce,
  state: string,
  redirectUri: string = REDIRECT_URI,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: ORIGINATOR,
  });
  return `${ISSUER}/oauth/authorize?${params.toString()}`;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

async function requestTokens(body: URLSearchParams): Promise<CodexTokens> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Token request failed (${response.status})${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`,
    );
  }
  const data = (await response.json()) as RawTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Token response did not include access/refresh tokens");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  };
}

export function exchangeCodeForTokens(
  code: string,
  pkce: CodexPkce,
  redirectUri: string = REDIRECT_URI,
): Promise<CodexTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<CodexTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  );
}

/** Decodes the payload of a JWT without verifying its signature. */
export function parseJwtClaims(token: string): CodexIdTokenClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as CodexIdTokenClaims;
  } catch {
    return undefined;
  }
}

/** Claims are exposed either flat or nested under the OpenAI auth namespace. */
function pickAuthClaims(
  claims: CodexIdTokenClaims,
): CodexIdTokenClaims["https://api.openai.com/auth"] {
  return claims["https://api.openai.com/auth"];
}

export function extractAccountIdFromClaims(
  claims: CodexIdTokenClaims,
): string | undefined {
  return (
    claims.chatgpt_account_id ||
    pickAuthClaims(claims)?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}

export function extractAccountId(tokens: CodexTokens): string | undefined {
  const sources = [tokens.idToken, tokens.accessToken].filter(
    (token): token is string => Boolean(token),
  );
  for (const token of sources) {
    const claims = parseJwtClaims(token);
    const accountId = claims ? extractAccountIdFromClaims(claims) : undefined;
    if (accountId) return accountId;
  }
  return undefined;
}

export function extractEmailFromClaims(
  claims: CodexIdTokenClaims,
): string | undefined {
  return claims.email || pickAuthClaims(claims)?.email;
}

export function extractEmail(tokens: CodexTokens): string | undefined {
  const sources = [tokens.idToken, tokens.accessToken].filter(
    (token): token is string => Boolean(token),
  );
  for (const token of sources) {
    const claims = parseJwtClaims(token);
    const email = claims ? extractEmailFromClaims(claims) : undefined;
    if (email) return email;
  }
  return undefined;
}

export function extractResidencyFromClaims(
  claims: CodexIdTokenClaims,
): string | undefined {
  return (
    claims.chatgpt_account_residency ||
    pickAuthClaims(claims)?.chatgpt_account_residency
  );
}

export function extractResidency(tokens: CodexTokens): string | undefined {
  const sources = [tokens.idToken, tokens.accessToken].filter(
    (token): token is string => Boolean(token),
  );
  for (const token of sources) {
    const claims = parseJwtClaims(token);
    const residency = claims ? extractResidencyFromClaims(claims) : undefined;
    if (residency) return residency;
  }
  return undefined;
}

/** EU accounts are served from a separate host. */
export function responsesEndpoint(accessToken: string): string {
  const residency = extractResidency({
    accessToken,
    refreshToken: "",
  });
  const base = residency?.toLowerCase() === "eu" ? CODEX_API_BASE_EU : CODEX_API_BASE;
  return `${base}/responses`;
}
