import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `next build` with `output: "standalone"` does not copy the client assets into
 * the standalone folder, so the packaged app would render without CSS/JS. This
 * mirrors `.next/static` and `public/` into `.next/standalone`, which is the
 * folder Electron ships as `resources/app`.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(path.join(standalone, "server.js")))) {
    throw new Error(
      "`.next/standalone/server.js` is missing - run `next build` with output: 'standalone' first.",
    );
  }

  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(standalone, ".next", "static");
  await rm(staticDest, { recursive: true, force: true });
  await mkdir(path.dirname(staticDest), { recursive: true });
  await cp(staticSrc, staticDest, { recursive: true });

  const publicSrc = path.join(root, "public");
  if (await exists(publicSrc)) {
    const publicDest = path.join(standalone, "public");
    await rm(publicDest, { recursive: true, force: true });
    await cp(publicSrc, publicDest, { recursive: true });
  }

  console.log("standalone bundle prepared at .next/standalone");
}

await main();
