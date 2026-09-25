import { expect, test, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Creates a project through the UI and returns its project id. */
async function createProject(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId("new-project-button").first().click();
  await page.getByTestId("project-name-input").fill(name);
  await page.getByTestId("create-project-submit").click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const match = page.url().match(/\/projects\/([^/?#]+)/);
  if (!match) throw new Error("project id not found in url");
  return match[1];
}

test("manage phases: add, rename, tasks, status, copy and delete", async ({
  page,
}) => {
  const name = `Phase Project ${Date.now()}`;
  await createProject(page, name);

  // --- add a phase manually -------------------------------------------------
  await page.getByTestId("add-phase-button").click();
  const firstPhase = page.getByTestId("phase-card").first();
  await expect(firstPhase).toBeVisible();
  await expect(firstPhase.getByTestId("phase-status-badge")).toHaveAttribute(
    "data-status",
    "pending",
  );

  // --- rename it through the menu -------------------------------------------
  await page.getByTestId("phase-menu-trigger").first().click();
  await page.getByTestId("phase-menu-rename").click();
  await page.getByTestId("phase-title-input").fill("Phase: Design the schema");
  await page.getByTestId("phase-title-input").press("Enter");
  await expect(page.getByTestId("phase-title").first()).toHaveText(
    "Phase: Design the schema",
  );

  // --- add a task and tick it off -------------------------------------------
  await firstPhase.getByTestId("new-task-input").fill("Model the Project table");
  await firstPhase.getByTestId("add-task-button").click();
  await expect(firstPhase.getByTestId("task-checkbox")).toBeVisible();
  await expect(firstPhase.getByTestId("task-progress")).toContainText("0/1");

  // --- document the task: description + research notes ----------------------
  await firstPhase.getByTestId("task-details-toggle").click();
  await firstPhase
    .getByTestId("task-description-input")
    .fill("Create the Project/Phase/Task models and migrate them.");
  await firstPhase
    .getByTestId("task-notes-input")
    .fill("Researched: Prisma supports cascade deletes via onDelete: Cascade.");
  await firstPhase.getByTestId("save-task-details").click();

  await expect(firstPhase.getByTestId("task-description")).toHaveText(
    "Create the Project/Phase/Task models and migrate them.",
  );
  await expect(firstPhase.getByTestId("task-notes")).toContainText(
    "onDelete: Cascade",
  );

  await firstPhase.getByTestId("task-checkbox").check();
  await expect(firstPhase.getByTestId("task-progress")).toContainText("1/1");

  // --- copy the phase to the clipboard --------------------------------------
  await firstPhase.getByTestId("copy-phase-button").click();
  await expect(
    page.getByText("Copied to clipboard", { exact: false }).first(),
  ).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(`# ${name}`);
  expect(clipboard).toContain("## Phase 1: Phase: Design the schema");
  expect(clipboard).toContain("- [x] Model the Project table");
  expect(clipboard).toContain(
    "  Description: Create the Project/Phase/Task models and migrate them.",
  );
  expect(clipboard).toContain(
    "  Notes: Researched: Prisma supports cascade deletes",
  );

  // --- mark the phase done ---------------------------------------------------
  await firstPhase.getByTestId("phase-status-trigger").click();
  await page.getByTestId("status-done").click();
  await expect(firstPhase.getByTestId("phase-status-badge")).toHaveAttribute(
    "data-status",
    "done",
  );

  // --- add a second phase and verify copy-all output ------------------------
  await page.getByTestId("add-phase-button").click();
  await expect(page.getByTestId("phase-card")).toHaveCount(2);

  await page.getByTestId("copy-all-button").click();
  const all = await page.evaluate(() => navigator.clipboard.readText());
  expect(all).toContain("## Phase 1: Phase: Design the schema");
  expect(all).toContain("## Phase 2:");

  // --- delete the second phase ----------------------------------------------
  await page.getByTestId("phase-menu-trigger").nth(1).click();
  await page.getByTestId("phase-menu-delete").click();
  await page.getByTestId("confirm-delete-phase").click();
  await expect(page.getByTestId("phase-card")).toHaveCount(1);
});
