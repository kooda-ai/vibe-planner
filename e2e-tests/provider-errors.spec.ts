import { expect, test } from "@playwright/test";

test("rejects a pasted terminal output instead of storing it as an API key", async ({ page, request }) => {
  const badKey = `sk-example${"x".repeat(5000)}╭`;
  await page.goto("/settings");
  await page.getByTestId("add-provider-button").click();
  await page.getByTestId("provider-name-input").fill("Invalid key provider");
  await page.getByTestId("provider-api-key-input").fill(badKey);
  await page.getByTestId("save-provider").click();

  await expect(page.getByText(/API key contains unsupported characters/)).toBeVisible();
  await expect(page.getByTestId("provider-row").filter({ hasText: "Invalid key provider" })).toHaveCount(0);

  const models = await request.post("/api/models", { data: { type: "openai", apiKey: badKey } });
  expect(models.status()).toBe(400);
  expect((await models.json()).error).toBe("invalid_api_key");
});

test("a failed provider request does not become an assistant message", async ({ page, request }) => {
  const name = `Unreachable provider ${Date.now()}`;
  const settings = await request.get("/api/settings");
  const current = await settings.json();
  const saved = await request.put("/api/settings", {
    data: {
      providers: [
        ...current.providers.map((provider: { id: string; name: string; type: string; baseUrl?: string; models: string[] }) => ({ ...provider, apiKey: "" })),
        { name, type: "openai-compatible", apiKey: "sk-test", baseUrl: "http://127.0.0.1:1/v1", models: ["test-model"] },
      ],
    },
  });
  expect(saved.ok()).toBeTruthy();
  const provider = (await saved.json()).providers.find((item: { name: string }) => item.name === name);
  const selected = await request.put("/api/settings", {
    data: { defaultProviderId: provider.id, defaultModel: "test-model" },
  });
  expect(selected.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByTestId("new-project-button").first().click();
  await page.getByTestId("project-name-input").fill(`Network error ${Date.now()}`);
  await page.getByTestId("create-project-submit").click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("chat-input").fill("Plan a small project");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-error")).toContainText("Could not reach the AI provider", { timeout: 60_000 });

  await page.reload();
  await expect(page.getByTestId("chat-panel")).toContainText("Plan a small project");
  await expect(page.getByTestId("chat-panel")).not.toContainText("⚠️");

  const restored = await request.put("/api/settings", {
    data: {
      providers: current.providers.map((item: { id: string; name: string; type: string; baseUrl?: string; models: string[] }) => ({ ...item, apiKey: "" })),
      defaultProviderId: current.defaultProviderId,
      defaultModel: current.defaultModel,
    },
  });
  expect(restored.ok()).toBeTruthy();
});
