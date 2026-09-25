import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";

import { UPDATE_STATUS_CHANNEL, type UpdateStatus } from "./ipc";

/**
 * Desktop shell for Vibe Planner.
 *
 * The app is server-rendered: in development we attach to `next dev`, and in a
 * packaged build Electron spawns Next's standalone `server.js` as a child
 * process and only then shows the window. Because the real server does the
 * work, the API routes — chat streaming and the `localhost:1455` Codex OAuth
 * callback included — behave exactly as they do on the web.
 */

/** In development `next dev` is started separately (usually on 3000). */
const DEV_SERVER_ORIGIN = `http://localhost:${Number(
  process.env.ELECTRON_DEV_PORT ?? 3000,
)}`;
const APP_ID = "com.vibeplanner.app";
/** Preferred port for the bundled server; a free port is picked if it is busy. */
const PREFERRED_PORT = 4763;

/** The standalone bundle is copied here by electron-builder (outside the asar). */
const SERVER_DIR = path.join(process.resourcesPath, "app");

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverOrigin: string | null = null;
let quitting = false;

const isDev = !app.isPackaged;

/* -------------------------------------------------------------------------- */
/*                                Local server                                */
/* -------------------------------------------------------------------------- */

/** Asks the OS for a free port so a busy `4763` never blocks startup. */
function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => {
      const fallback = createServer();
      fallback.unref();
      fallback.once("error", () => resolve(0));
      fallback.listen(0, "127.0.0.1", () => {
        const address = fallback.address();
        const port = typeof address === "object" && address ? address.port : 0;
        fallback.close(() => resolve(port));
      });
    });
    probe.listen(preferred, "127.0.0.1", () => {
      probe.close(() => resolve(preferred));
    });
  });
}

/**
 * Polls the server until it answers. Next only serves requests once it is
 * listening, so a successful fetch doubles as the readiness signal.
 */
async function waitForServer(origin: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error("The Next.js server exited before it became ready.");
    }
    try {
      const response = await fetch(origin, { method: "HEAD" });
      if (response.status > 0) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `The Next.js server did not become ready within ${timeoutMs}ms.`,
  );
}

/** Spawns Next's standalone server and resolves once it accepts requests. */
async function startServer(): Promise<string> {
  const port = await findFreePort(PREFERRED_PORT);
  const origin = `http://127.0.0.1:${port}`;

  // Electron's bundled binary doubles as a plain Node runtime, which is what we
  // need here — no separate Node install is required on the user's machine.
  const child = spawn(process.execPath, [path.join(SERVER_DIR, "server.js")], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      // User data must never land inside the (read-only) application bundle.
      PLANNER_DATA_FILE: path.join(app.getPath("userData"), "planner.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess = child;
  // Guard against an unhandled 'error' event taking the whole app down.
  child.on("error", (error) =>
    log.error("[next] could not start the server", error),
  );
  child.stdout?.on("data", (data: Buffer) =>
    log.info("[next]", data.toString().trimEnd()),
  );
  child.stderr?.on("data", (data: Buffer) =>
    log.warn("[next]", data.toString().trimEnd()),
  );

  try {
    await waitForServer(origin);
  } catch (error) {
    child.kill();
    serverProcess = null;
    throw error;
  }

  log.info(`[next] ready on ${origin}`);
  return origin;
}

/* -------------------------------------------------------------------------- */
/*                                   Window                                   */
/* -------------------------------------------------------------------------- */

/** Shown while the bundled server boots, so the window is never blank white. */
function loadingMarkup(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <title>Vibe Planner</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; align-items: center; justify-content: center;
        background: #0f1115; color: #e6e8ee;
        font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .spinner {
        width: 28px; height: 28px; margin: 0 auto 1rem;
        border: 3px solid #2a2f3a; border-top-color: #7c9cff; border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      p { margin: 0; color: #9ba3b4; }
    </style>
  </head>
  <body><div style="text-align:center"><div class="spinner"></div><p>Loading Vibe Planner…</p></div></body>
</html>`;
}

function htmlEscape(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char,
  );
}

function showStartupError(message: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Vibe Planner</title></head>
<body style="font:15px/1.6 system-ui,sans-serif;padding:2rem;color:#e6e8ee;background:#0f1115">
<h1 style="font-size:1.1rem">Vibe Planner could not start</h1>
<p style="color:#9ba3b4">${htmlEscape(message)}</p>
<p style="color:#9ba3b4">Quit the app and start it again. If it keeps failing,
reinstall the latest release from GitHub.</p></body></html>`;
  void mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(body)}`,
  );
}

/** External links (the Codex authorize page among them) open in the browser. */
function openExternally(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (protocol === "http:" || protocol === "https:") {
      void shell.openExternal(url);
    }
  } catch {
    // Not a URL we can hand to the OS — ignore it.
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Vibe Planner",
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // `window.open` / target=_blank must never take over the app window itself.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });
  // In-page navigation may only stay inside the local app.
  window.webContents.on("will-navigate", (event, url) => {
    if (serverOrigin && url.startsWith(serverOrigin)) return;
    event.preventDefault();
    openExternally(url);
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  return window;
}

function showLoading(window: BrowserWindow): void {
  void window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(loadingMarkup())}`,
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Menu                                    */
/* -------------------------------------------------------------------------- */

function buildMenu(): void {
  // macOS keeps its app menu so Cmd+Q / Cmd+H keep working.
  const appMenu: MenuItemConstructorOptions[] =
    process.platform === "darwin" ? [{ role: "appMenu" }] : [];

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(process.platform === "darwin"
          ? [{ role: "zoom" as const }]
          : []),
      ],
    },
    { label: "Quit", role: "quit" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------------- */
/*                                Auto-update                                 */
/* -------------------------------------------------------------------------- */

function sendUpdateStatus(status: UpdateStatus): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, status);
}

/**
 * Wires electron-updater to the window. macOS is skipped deliberately: an
 * unsigned build cannot be auto-updated, so those users download the release
 * from GitHub instead.
 */
function setupAutoUpdater(): void {
  if (isDev) return;
  if (process.platform === "darwin") {
    log.info("[updater] disabled on macOS (builds are not code-signed)");
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () =>
    sendUpdateStatus({ state: "checking" }),
  );
  autoUpdater.on("update-available", (info) =>
    sendUpdateStatus({ state: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () =>
    sendUpdateStatus({ state: "not-available" }),
  );
  autoUpdater.on("download-progress", (progress) =>
    sendUpdateStatus({ state: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    sendUpdateStatus({ state: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (error) =>
    sendUpdateStatus({ state: "error", message: error.message }),
  );

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    log.warn("[updater] update check failed", error);
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Lifecycle                                  */
/* -------------------------------------------------------------------------- */

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function stopServer(): void {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
  serverProcess = null;
}

async function boot(): Promise<void> {
  const window = createWindow();
  mainWindow = window;
  showLoading(window);

  try {
    serverOrigin = isDev ? DEV_SERVER_ORIGIN : await startServer();
  } catch (error) {
    log.error("[boot] could not start the local server", error);
    if (!quitting) {
      showStartupError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (quitting) return;
  await window.loadURL(serverOrigin);
  setupAutoUpdater();
}

// The data file lives in userData, so a second instance would fight over it (and
// over the fixed OAuth port). Focus the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on("second-instance", focusMainWindow);

  app.on("before-quit", () => {
    quitting = true;
    stopServer();
  });

  app.on("window-all-closed", () => {
    // Closing the window quits the app (and its server) everywhere except
    // macOS, where the dock keeps it alive.
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (mainWindow) {
      focusMainWindow();
      return;
    }
    void boot();
  });

  void app.whenReady().then(async () => {
    log.initialize();
    buildMenu();
    await boot();
  });
}
