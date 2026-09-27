import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
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
  // `node_modules` must be its own entry: the copy filter drops a root-level
  // `node_modules` directory, so bundling it with the standalone folder ships
  // `server.js` without the packages it requires.
  expect(config).toContain("from: .next/standalone/node_modules");
  expect(config).toContain("to: app/node_modules");
  // One installer per platform.
  expect(config).toContain("target: nsis");
  expect(config).toContain("target: dmg");
  expect(config).toContain("target: AppImage");
  // electron-updater reads the latest*.yml metadata from the GitHub release.
  expect(config).toContain("provider: github");
});

/**
 * `server.js` starts with `require('next')`, so the packaged `resources/app`
 * must contain a `node_modules` tree Node can resolve through. The previous
 * config copied only `.next/standalone`, and builder-util's filter silently
 * drops a root-level `node_modules` — producing "Cannot find module 'next'".
 *
 * This drives electron-builder's real copy code with the `extraResources`
 * entries declared in electron-builder.yml against a pnpm-shaped bundle, so a
 * config regression that stops shipping `node_modules` fails here.
 */
test("the packaged app ships the standalone node_modules tree", async () => {
  const require = createRequire(path.join(root, "package.json"));
  // `app-builder-lib` is not a direct dependency; reach it via electron-builder.
  const resolved = require.resolve("app-builder-lib/out/fileMatcher", {
    paths: [path.dirname(require.resolve("electron-builder/package.json"))],
  });
  const { FileMatcher, copyFiles } = require(resolved) as {
    FileMatcher: new (
      from: string,
      to: string,
      macroExpander: (value: string) => string,
      patterns: string[],
    ) => unknown;
    copyFiles: (matchers: unknown[], transformer: unknown) => Promise<void>;
  };

  // Read the shippable config itself, so dropping the node_modules entry fails
  // here. `from` resolves against the project dir, `to` against resources.
  // js-yaml is electron-builder's own dependency, so resolve it from there
  // rather than relying on the project's (strict pnpm) node_modules.
  const yaml = require(require.resolve("js-yaml", { paths: [path.dirname(resolved)] })) as {
    load: (input: string) => {
      extraResources?: (string | { from: string; to: string })[];
    };
  };
  const declared = yaml.load(read("electron-builder.yml")).extraResources ?? [];

  // Build the synthetic standalone bundle the config points at, with pnpm's
  // real layout: top-level `node_modules/<pkg>` links into `.pnpm/`, plus
  // nested dependency links inside a package's store folder.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "dyad-standalone-"));
  const standalone = path.join(tmp, ".next", "standalone");
  const resourcesDir = path.join(tmp, "resources");
  const entries = declared.map((entry) => {
    const [from, to] =
      typeof entry === "string" ? [entry, "."] : [entry.from, entry.to];
    return { from: path.join(tmp, from), to: path.join(resourcesDir, to) };
  });
  // Without this entry the bundle ships no dependencies at all.
  expect(entries.some((entry) => entry.from.endsWith("node_modules"))).toBe(true);
  const write = (relative: string, content: string) => {
    const file = path.join(standalone, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const link = (relative: string, target: string) => {
    const at = path.join(standalone, relative);
    mkdirSync(path.dirname(at), { recursive: true });
    symlinkSync(target, at, "dir");
  };

  write("server.js", "require('next')\n");
  write(".next/static/chunk.js", "console.log(1)\n");
  write("public/logo.svg", "<svg/>");
  write(
    "node_modules/.pnpm/next@15.5.26/node_modules/next/package.json",
    '{"name":"next","main":"dist/server.js"}',
  );
  write("node_modules/.pnpm/next@15.5.26/node_modules/next/dist/server.js", "//");
  write(
    "node_modules/.pnpm/react@19.3.0/node_modules/react/package.json",
    '{"name":"react"}',
  );
  // pnpm links a package's dependencies from its own store folder.
  link(
    "node_modules/.pnpm/next@15.5.26/node_modules/react",
    "../../react@19.3.0/node_modules/react",
  );
  link("node_modules/next", ".pnpm/next@15.5.26/node_modules/next");
  link("node_modules/react", ".pnpm/react@19.3.0/node_modules/react");

  try {
    await copyFiles(
      entries.map(
        (entry) => new FileMatcher(entry.from, entry.to, (value) => value, []),
      ),
      null,
    );

    const app = path.join(resourcesDir, "app");
    // The web app itself still arrives.
    expect(existsSync(path.join(app, "server.js"))).toBe(true);
    expect(existsSync(path.join(app, ".next", "static", "chunk.js"))).toBe(true);
    // The fix: the dependencies `require('next')` resolves through are present.
    expect(existsSync(path.join(app, "node_modules", "next", "package.json"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(app, "node_modules", "next", "dist", "server.js")),
    ).toBe(true);
    // Nested pnpm links survive and point into the shipped store.
    expect(
      existsSync(
        path.join(
          app,
          "node_modules",
          ".pnpm",
          "next@15.5.26",
          "node_modules",
          "react",
          "package.json",
        ),
      ),
    ).toBe(true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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
