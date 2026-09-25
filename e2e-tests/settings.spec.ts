import { expect, test } from "@playwright/test";

test("add an AI provider, pick a default model and delete it again", async ({
  page,
}) => {
  const providerName = `E2E Provider ${Date.now()}`;

  await page.goto("/settings");
  await expect(page.getByTestId("settings-title")).toBeVisible();

  await page.getByTestId("add-provider-button").click();
  await page.getByTestId("provider-name-input").fill(providerName);
  await page.getByTestId("provider-api-key-input").fill("sk-test-key");
  await page
    .getByTestId("provider-models-input")
    .fill("gpt-4o-mini, gpt-4o");
  await page.getByTestId("save-provider").click();

  const row = page.getByTestId("provider-row").filter({ hasText: providerName });
  await expect(row).toBeVisible();

  // A stored provider is offered as the default and exposes its models.
  await page.getByTestId("default-provider-select").click();
  await page.getByRole("option", { name: providerName }).click();

  await page.getByTestId("default-model-select").click();
  await page.getByRole("option", { name: "gpt-4o-mini" }).click();
  await expect(page.getByTestId("default-model-select")).toContainText("gpt-4o-mini");

  // The API key is never sent back to the client — still listed, but not shown.
  await expect(row).not.toContainText("sk-test-key");

  // Survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByTestId("provider-row").filter({ hasText: providerName })).toBeVisible();

  await page.getByTestId("provider-row").filter({ hasText: providerName }).getByTestId("delete-provider").click();
  await page.getByTestId("confirm-delete-provider").click();
  await expect(page.getByText(providerName)).toHaveCount(0);
});
