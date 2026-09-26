import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * Bundles the Electron main process and preload script into `dist-electron/`.
 *
 * Everything except `electron` itself is inlined (including the
 * `electron-updater` runtime dependency), so the packaged app does not need a
 * duplicated node_modules tree next to the asar archive.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist-electron");

const shared = {
  bundle: true,
  platform: "node",
  // Matches the Node version Electron embeds (Electron 43 ships Node 24), which
  // is also the runtime that executes the bundled Next.js server.
  target: "node24",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
};

async function main() {
  await rm(outdir, { recursive: true, force: true });

  await build({
    ...shared,
    entryPoints: [path.join(root, "electron", "main.ts")],
    outfile: path.join(outdir, "main.js"),
  });

  await build({
    ...shared,
    entryPoints: [path.join(root, "electron", "preload.ts")],
    outfile: path.join(outdir, "preload.js"),
  });
}

await main();
