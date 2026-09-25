import { expect, test } from "@playwright/test";

import { CODEX_CLIENT_VERSIONS } from "../src/lib/ai/codex-oauth";

/**
 * Covers the "OpenAI (Sign in with ChatGPT)" provider type without ever touching
 * the live OAuth flow: selecting the type must hide the API-key/base-URL fields
 * and offer the ChatGPT connect button instead.
 */
test("selecting the ChatGPT provider type swaps the API key for a connect button", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-title")).toBeVisible();

  await page.getByTestId("add-provider-button").click();

  // Defaults to the API-key flow.
  await expect(page.getByTestId("provider-api-key-input")).toBeVisible();
  await expect(page.getByTestId("codex-connect-button")).toHaveCount(0);

  await page.getByTestId("provider-type-select").click();
  await page
    .getByRole("option", { name: "OpenAI (Sign in with ChatGPT)" })
    .click();

  // Credentials are replaced by the browser login.
  await expect(page.getByTestId("provider-api-key-input")).toHaveCount(0);
  await expect(page.getByTestId("provider-base-url-input")).toHaveCount(0);
  await expect(page.getByTestId("codex-connect-button")).toBeVisible();
  await expect(page.getByTestId("codex-connect-button")).toBeEnabled();

  // The model field stays, pre-filled with the built-in Codex catalogue.
  await expect(page.getByTestId("provider-models-input")).toHaveValue(
    /gpt-6-astra/,
  );
  await expect(page.getByTestId("provider-models-input")).toHaveValue(
    /gpt-6-sol/,
  );
});

/**
 * Exercises the login endpoints directly instead of driving the real OAuth
 * consent screen: starting a login must hand back a well-formed authorize URL,
 * and an unknown state must be reported as expired rather than crashing.
 */
test("starting a ChatGPT login returns a well-formed authorize URL", async ({
  request,
}) => {
  const start = await request.post("/api/oauth/codex/start");
  expect(start.ok()).toBeTruthy();

  const { authUrl, state } = (await start.json()) as {
    authUrl: string;
    state: string;
  };
  expect(state.length).toBeGreaterThan(0);

  const url = new URL(authUrl);
  expect(url.origin).toBe("https://auth.openai.com");
  expect(url.pathname).toBe("/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://localhost:1455/auth/callback",
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe(state);

  // The login has not been approved yet.
  const pending = await request.get(
    `/api/oauth/codex/status?state=${encodeURIComponent(state)}`,
  );
  expect(pending.ok()).toBeTruthy();
  expect((await pending.json()).status).toBe("pending");

  // A state the server never issued is treated as expired.
  const unknown = await request.get("/api/oauth/codex/status?state=unknown-state");
  expect(unknown.ok()).toBeTruthy();
  expect((await unknown.json()).status).toBe("expired");
});

/**
 * Regression guard: earlier builds seeded Codex providers with `gpt-5.x-codex`
 * slugs that the backend rejects for ChatGPT accounts ("model is not supported
 * when using Codex with a ChatGPT account"). The seeded catalogue must only
 * contain slugs Codex actually lists.
 */
test("the default Codex catalogue avoids models ChatGPT accounts cannot use", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByTestId("add-provider-button").click();
  await page.getByTestId("provider-type-select").click();
  await page
    .getByRole("option", { name: "OpenAI (Sign in with ChatGPT)" })
    .click();

  const seeded = await page.getByTestId("provider-models-input").inputValue();
  expect(seeded).toContain("gpt-6-astra");
  expect(seeded).not.toMatch(/gpt-5\.\d+(\.\d+)?[-\w]*-codex/);
  expect(seeded).not.toContain("gpt-5.4");
});

/**
 * The model catalogue is version-gated: each entry has a
 * `minimal_client_version`, and asking with a version below it makes the
 * backend silently return a SHORTER list. `gpt-6-astra` needs >= 0.153.0 and
 * `gpt-6-sol` needs >= 0.155.0, so at least one probed version must clear
 * 0.155.0 — otherwise the fetch only ever yields the ungated `gpt-5.5`.
 */
test("the probed client versions are high enough to clear the model gates", () => {
  const numeric = (v: string) => v.split(".").map((part) => Number(part));
  const atLeast = (v: string, floor: number[]) => {
    const parts = numeric(v);
    for (let i = 0; i < 3; i += 1) {
      const a = parts[i] ?? 0;
      const b = floor[i] ?? 0;
      if (a !== b) return a > b;
    }
    return true;
  };

  expect(CODEX_CLIENT_VERSIONS.length).toBeGreaterThan(0);
  // At least one probed version must clear the newest known gate (gpt-6-sol),
  // otherwise the fetch would only ever return the ungated gpt-5.5.
  expect(CODEX_CLIENT_VERSIONS.some((v) => atLeast(v, [0, 155, 0]))).toBe(true);
  // Every probed version must still clear the older gate (gpt-6-astra), so the
  // fallback cannot be older than the stable release we target.
  for (const version of CODEX_CLIENT_VERSIONS) {
    expect(atLeast(version, [0, 153, 0])).toBe(true);
  }
});
