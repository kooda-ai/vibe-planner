import { expect, test } from "@playwright/test";

test("create a project from the dashboard and see it in the grid", async ({
  page,
}) => {
  const name = `E2E Project ${Date.now()}`;

  await page.goto("/");
  await expect(page.getByTestId("dashboard-title")).toBeVisible();

  await page.getByTestId("new-project-button").first().click();
  await page.getByTestId("project-name-input").fill(name);
  await page
    .getByTestId("project-description-input")
    .fill("Created by the end-to-end test");
  await page.getByTestId("create-project-submit").click();

  // Creating navigates straight into the new project.
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByTestId("project-title")).toHaveText(name);

  // The project shows up on the dashboard grid.
  await page.getByTestId("nav-dashboard").click();
  await expect(page.getByTestId("project-card-name").first()).toHaveText(name);
});
