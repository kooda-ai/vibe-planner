import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Guards the desktop release pipeline. The three platform builds cannot run
 * inside a browser test, so this asserts the wiring that makes them work: the
 * packaged app entry point, the Next standalone server handoff, and the
 * workflow that derives the version and publishes the release.
 */

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("the packaged app boots Next's standalone server from user data", () => {
  const main = read("electron/main.ts");

  // electron-builder copies `.next/standalone` to resources/app.
  expect(main).toContain('path.join(process.resourcesPath, "app")');
  // Next's server runs as a Node child process inside Electron.
  expect(main).toContain('ELECTRON_RUN_AS_NODE: "1"');
  // The data file must live in userData, not inside the read-only bundle.
  expect(main).toContain('app.getPath("userData")');
  expect(main).toContain("PLANNER_DATA_FILE");
  // Auto-update is deliberately skipped on macOS (unsigned builds).
  expect(main).toContain('process.platform === "darwin"');

  const pkg = JSON.parse(read("package.json")) as {
    main?: string;
    scripts?: Record<string, string>;
  };
  expect(pkg.main).toBe("dist-electron/main.js");
  expect(pkg.scripts?.["build:standalone"]).toContain("scripts/prepare-standalone.mjs");
  expect(pkg.scripts?.["build:electron"]).toContain("scripts/build-electron.mjs");
});

test("the packaging config ships the server outside the asar and publishes to GitHub", () => {
  const config = read("electron-builder.yml");

  // Asar-external resources keep `node server.js` working.
  expect(config).toContain("from: .next/standalone");
  expect(config).toContain("to: app");
  // One installer per platform.
  expect(config).toContain("target: nsis");
  expect(config).toContain("target: dmg");
  expect(config).toContain("target: AppImage");
  // electron-updater reads the latest*.yml metadata from the GitHub release.
  expect(config).toContain("provider: github");
});

test("the release workflow bumps the patch version and publishes a release", () => {
  const workflow = read(".github/workflows/release.yml");

  expect(workflow).toContain("contents: write");
  expect(workflow).toContain("windows-latest");
  expect(workflow).toContain("macos-latest");
  expect(workflow).toContain("ubuntu-latest");
  // The release tag is created only from the computed version.
  expect(workflow).toContain("gh release create");
  expect(workflow).toMatch(/v\$\{\{ needs\.version\.outputs\.version \}\}/);
});

/**
 * The desktop build targets Node 24 LTS: the CI runners build with it and the
 * bundle is emitted for it. Electron embeds its own Node runtime (Electron 40+
 * ships Node 24), which both the main process and the spawned Next.js server
 * run on, so the esbuild target must match the Electron major.
 */
test("the desktop toolchain targets Node 24 LTS", () => {
  const workflow = read(".github/workflows/release.yml");
  // The version stamp step must not silently pick a different Node.
  expect(workflow).toMatch(/node-version:\s*24/);
  expect(workflow).not.toMatch(/node-version:\s*20/);

  const buildScript = read("scripts/build-electron.mjs");
  expect(buildScript).toContain('target: "node24"');

  // Electron >= 40 is what makes the Node 24 runtime apply; electron 33 still
  // embedded Node 20.18.
  const pkg = JSON.parse(read("package.json")) as {
    devDependencies?: Record<string, string>;
  };
  const electronRange = pkg.devDependencies?.electron ?? "";
  const electronMajor = Number(electronRange.replace(/[^\d.]/g, "").split(".")[0]);
  expect(electronMajor).toBeGreaterThanOrEqual(40);
});

test("the desktop update bridge is optional so the web app is unaffected", async ({
  page,
}) => {
  await page.goto("/settings");

  // No Electron preload in a plain browser — nothing must be required for the
  // page to work.
  const hasDesktop = await page.evaluate(
    () => typeof (window as { desktop?: unknown }).desktop !== "undefined",
  );
  expect(hasDesktop).toBe(false);
  await expect(page.getByTestId("settings-title")).toBeVisible();
});
