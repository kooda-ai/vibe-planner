import { expect, test } from "@playwright/test";

/**
 * Covers the "OpenAI (ChatGPT ile giriş)" provider type without ever touching
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
    .getByRole("option", { name: "OpenAI (ChatGPT ile giriş)" })
    .click();

  // Credentials are replaced by the browser login.
  await expect(page.getByTestId("provider-api-key-input")).toHaveCount(0);
  await expect(page.getByTestId("provider-base-url-input")).toHaveCount(0);
  await expect(page.getByTestId("codex-connect-button")).toBeVisible();
  await expect(page.getByTestId("codex-connect-button")).toBeEnabled();

  // The model field stays, pre-filled with the built-in Codex catalogue.
  await expect(page.getByTestId("provider-models-input")).toHaveValue(
    /gpt-5\.3-codex/,
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
