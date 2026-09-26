import { expect, test } from "@playwright/test";

/**
 * Covers the MCP + Skills surfaces: adding an MCP server (and importing one from
 * an `mcpServers` JSON block), skill CRUD in Settings, the per-project skill
 * picker and the `/` slash autocomplete in the chat input.
 *
 * No MCP server is actually contacted here — the tests exercise the settings UI
 * and storage, which is what the user drives.
 */

test("add an MCP server by hand and delete it again", async ({ page }) => {
  const name = `E2E MCP ${Date.now()}`;

  await page.goto("/settings");
  await expect(page.getByTestId("settings-title")).toBeVisible();

  // stdio servers warn about running local commands.
  await expect(page.getByTestId("mcp-warning")).toBeVisible();

  await page.getByTestId("add-mcp-server").click();
  await page.getByTestId("mcp-name-input").fill(name);
  await page.getByTestId("mcp-command-input").fill("npx");
  await page
    .getByTestId("mcp-args-input")
    .fill("-y @modelcontextprotocol/server-memory");
  await page.getByTestId("save-mcp-server").click();

  const row = page.getByTestId("mcp-server-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("stdio");
  await expect(row).toContainText("npx");

  // Survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByTestId("mcp-server-row").filter({ hasText: name })).toBeVisible();

  await page
    .getByTestId("mcp-server-row")
    .filter({ hasText: name })
    .getByTestId("delete-mcp-server")
    .click();
  await page.getByTestId("confirm-delete-mcp-server").click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("import MCP servers from a Claude Desktop style JSON block", async ({
  page,
}) => {
  const name = `imported-memory-${Date.now()}`;

  await page.goto("/settings");
  await expect(page.getByTestId("settings-title")).toBeVisible();

  await page.getByTestId("import-mcp-servers").click();
  await page.getByTestId("mcp-import-input").fill(
    JSON.stringify({
      mcpServers: {
        [name]: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
        },
      },
    }),
  );
  await page.getByTestId("submit-mcp-import").click();

  const row = page.getByTestId("mcp-server-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("stdio");
});

test("test a stdio MCP server and toggle per-tool auto-approve", async ({
  page,
}) => {
  const name = `E2E Echo ${Date.now()}`;

  await page.goto("/settings");

  // Connect to the real stdio fixture server bundled with the tests.
  await page.getByTestId("add-mcp-server").click();
  await page.getByTestId("mcp-name-input").fill(name);
  await page.getByTestId("mcp-command-input").fill("node");
  await page
    .getByTestId("mcp-args-input")
    .fill("e2e-tests/fixtures/echo-mcp-server.mjs");
  await page.getByTestId("save-mcp-server").click();

  const row = page.getByTestId("mcp-server-row").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Testing connects, lists the fixture's `echo` tool and reports Connected.
  await row.getByTestId("mcp-test-server").click();
  await expect(row.getByTestId("mcp-status")).toHaveText("Connected", {
    timeout: 20_000,
  });

  const toolRow = row.getByTestId("mcp-tool-row").filter({ hasText: "echo" });
  await expect(toolRow).toBeVisible();

  // Per-tool auto-approve is off by default (tools ask before running).
  const toggle = toolRow.getByTestId("mcp-tool-auto-approve");
  await expect(toggle).toHaveAttribute("data-state", "unchecked");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "checked");

  // The permission is persisted server-side.
  await page.reload();
  const reloaded = page.getByTestId("mcp-server-row").filter({ hasText: name });
  await reloaded.getByTestId("mcp-test-server").click();
  await expect(
    reloaded
      .getByTestId("mcp-tool-row")
      .filter({ hasText: "echo" })
      .getByTestId("mcp-tool-auto-approve"),
  ).toHaveAttribute("data-state", "checked");

  await reloaded.getByTestId("delete-mcp-server").click();
  await page.getByTestId("confirm-delete-mcp-server").click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("create, disable and delete a skill", async ({ page }) => {
  const name = `E2E Skill ${Date.now()}`;

  await page.goto("/settings");
  await expect(page.getByTestId("settings-title")).toBeVisible();

  await page.getByTestId("add-skill").click();
  await page.getByTestId("skill-name-input").fill(name);
  await page
    .getByTestId("skill-description-input")
    .fill("Use when the user asks for a security review.");
  await page
    .getByTestId("skill-body-input")
    .fill("Always check for missing authorization and unsafe input handling.");

  // The slug is previewed as the name is typed.
  await expect(page.getByTestId("skill-slug-preview")).toContainText("/e2e-skill");

  await page.getByTestId("save-skill").click();

  const row = page.getByTestId("skill-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(page.getByTestId("skills-active-group")).toContainText(name);

  // Disabling moves it into the inactive group.
  await row.getByTestId("skill-enabled").click();
  await expect(page.getByTestId("skills-inactive-group")).toContainText(name);

  await page.getByTestId("skill-row").filter({ hasText: name }).getByTestId("delete-skill").click();
  await page.getByTestId("confirm-delete-skill").click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("pick project skills and use the slash autocomplete in chat", async ({
  page,
}) => {
  const projectName = `E2E Skills Project ${Date.now()}`;
  const skillName = `E2E Slash ${Date.now()}`;
  const slug = "e2e-slash";

  // Create a skill to pick from.
  await page.goto("/settings");
  await page.getByTestId("add-skill").click();
  await page.getByTestId("skill-name-input").fill(skillName);
  await page.getByTestId("skill-body-input").fill("Always respond in short sentences.");
  await page.getByTestId("save-skill").click();
  await expect(
    page.getByTestId("skill-row").filter({ hasText: skillName }),
  ).toBeVisible();

  // Create a project to scope the selection to.
  await page.goto("/");
  await page.getByTestId("new-project-button").first().click();
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("create-project-submit").click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);

  // No explicit selection means "all enabled skills".
  await expect(page.getByTestId("skill-picker")).toBeVisible();
  await expect(page.getByTestId("skill-picker-summary")).toContainText(
    "All enabled skills",
  );

  await page.getByTestId("skill-picker").click();
  // Each checkbox is labelled by the skill's name.
  await page.getByRole("checkbox", { name: skillName }).click();
  await expect(page.getByTestId("skill-picker-summary")).toContainText("1 skill");

  // Typing "/" offers the project's skills.
  const input = page.getByTestId("chat-input");
  await input.click();
  await input.type(`/${slug.slice(0, 5)}`);
  await expect(page.getByTestId("slash-suggestions")).toBeVisible();
  await page.getByTestId("slash-suggestion").first().click();
  await expect(input).toHaveValue(/\/e2e-slash/);

  // The applied skill shows up as a chip under the input.
  await expect(page.getByTestId("skill-chips")).toContainText(`/${slug}`);
});
