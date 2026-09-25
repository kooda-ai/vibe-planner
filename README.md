# Vibe Planner — AI Project Planner

A single-user app that splits a project idea into **phases** by chatting with an AI,
lets you manage each phase with a task list + notes + status, and copies any phase into your
**vibe coder** (e.g. Dyad) with one click. It runs both in the browser and as a packaged
**desktop app** (Windows / macOS / Linux).

## Features

- **Dashboard** — project cards, phase/task progress and the "New Project" flow.
- **AI chat** — streaming answers; the hidden JSON block the AI produces is turned into
  phases automatically and lands in the panel on the right.
- **Phase panel** — drag-and-drop ordering, renaming, adding phases/tasks manually, notes
  and status (pending / in progress / done).
- **Task details** — every task has its own **description** (what it does, how to implement
  it) and **research notes** field; edit it with the `›` button on the task row, see a
  summary on the card, and get it in the copy output too.
- **Detailed AI plans** — for each phase the AI produces the sections *goal, out of scope,
  context, preconditions, work, constraints, tests, acceptance criteria, watch out, output,
  verification*, and writes a description + notes for every task.
- **One-click copy** — per phase or all phases in one document, using the
  `# project / ## phase / content` template (confirmed with a Sonner toast).
- **Multiple AI providers** — OpenAI, Anthropic, a custom OpenAI-compatible `base URL`, and
  **Sign in with ChatGPT (Codex)**. API keys and OAuth tokens are stored server-side only
  and are never sent to the client.
- **Settings** — add/remove providers, model selection, theme, language (EN/TR) and
  export/import.
- **Theme & language** — light/dark/system via `next-themes`, plus a lightweight EN/TR
  dictionary (English is the default).

## Getting started

```bash
pnpm install      # or npm install
pnpm dev          # http://localhost:3000
```

The app works out of the box: data is written to `.data/planner.json` (the path can be
changed with the `PLANNER_DATA_FILE` environment variable).

### First run

1. **Settings → AI Providers → Add provider**: pick the type (OpenAI / Anthropic /
   OpenAI-compatible), enter a name, API key and models (you can load models with
   "Fetch models").
2. Pick the default provider and model.
3. Create a project from the dashboard and describe your idea in the chat
   (e.g. _"draft an MVP plan for a marketplace app"_).
4. Edit the phases and use **Copy** to paste them into your vibe coder.

## Sign in with ChatGPT (Codex) — experimental

Alongside the existing `OpenAI` / `Anthropic` / `OpenAI-compatible` types there is a
provider that signs in with **your own ChatGPT Plus/Pro account** instead of an API key:
`OpenAI (Sign in with ChatGPT)`.

> ⚠️ **This is not an official developer login.** It uses a fixed OAuth client registered
> for the Codex CLI (`app_EMoamEEZ73f0CkXaXp7hrann`). OpenAI tolerates the flow but
> reserves the right to change or block it; it is a grey area in terms of the terms of use.
> That is why the feature is labelled **"experimental"** in the UI. If the flow breaks, the
> files to fix are `src/lib/ai/codex*.ts`.

**Flow**

1. Settings → Add provider → choose the type `OpenAI (Sign in with ChatGPT)`.
2. Press **Connect with ChatGPT**; OpenAI's authorization page opens in your browser.
3. Approve with your ChatGPT Plus/Pro account. The page polls the server every ~2s; once
   approved the provider is saved automatically and the card shows **Connected** + the
   account email.
4. **Disconnect** deletes the tokens (and therefore the provider).

**How it works**

- `redirect_uri` is fixed at `http://localhost:1455/auth/callback`; the Next.js process
  opens a **temporary HTTP listener** on that port (`src/lib/ai/codex-auth-server.ts`). If
  the port is taken it returns a descriptive error.
- Tokens are stored **server-side only** (`.data/planner.json`); the client only ever
  receives the `connected` flag and the email.
- Chat requests go to the **Responses API**
  (`https://chatgpt.com/backend-api/codex/responses`) and use different SSE events
  (`response.output_text.delta`, `response.completed`); that difference is normalized in
  `src/lib/ai/codex.ts`. When the token expires, `src/lib/ai/codex-token.ts` refreshes it
  silently.
- **Models:** the Codex backend exposes a catalogue at
  `GET /backend-api/codex/models?client_version=…`. The **"Fetch models"** button in
  Settings queries that endpoint. Two filters apply:
  - `visibility: "list"` — models that cannot be used with a ChatGPT account are hidden by
    the backend; selecting one returns _"model is not supported when using Codex with a
    ChatGPT account"_.
  - `minimal_client_version` — **critical**: the catalogue is gated by version, and if you
    send a very old `client_version` the backend does not error, it just returns a
    **shorter** list (e.g. only the ungated `gpt-5.5`). That is why several versions are
    tried and the richest list wins (`CODEX_CLIENT_VERSIONS`).
  New connections start from Codex CLI's own catalogue (`gpt-6-astra`, `gpt-6-sol`).
- There is no session concept: a **single ChatGPT account is connected for the whole
  server**, and every browser uses that account.

## Desktop app (Electron)

The desktop build keeps the whole server-side app intact: Electron spawns Next's
`standalone` server (`server.js`) as a child process and loads the UI from
`http://127.0.0.1:<port>`. Every API route — chat streaming and the
`localhost:1455` Codex OAuth callback included — therefore behaves exactly as it does on
the web.

### Running it

```bash
pnpm desktop          # dev: next dev + Electron pointing at it (port 3000)
pnpm dist:dir         # production build, unpacked (dist/… — quickest way to test)
pnpm dist             # full installers (nsis / dmg / AppImage + deb)
```

`pnpm desktop` builds the Electron bundles with esbuild and starts Electron against the
dev server. `dist`/`dist:dir` first run `next build` with `output: "standalone"` and copy
`.next/static` + `public` into `.next/standalone` before packaging.

### Where data lives

The packaged app writes to **`app.getPath("userData")/planner.json`** (e.g.
`%APPDATA%/Vibe Planner` on Windows, `~/Library/Application Support/Vibe Planner` on
macOS, `~/.config/Vibe Planner` on Linux), passed to the server through the
`PLANNER_DATA_FILE` environment variable. Nothing is ever written inside the application
bundle, which is read-only on Windows and macOS.

### Desktop behaviour

- **Single instance** — a second launch focuses the existing window (protects both the
  data file and the fixed `1455` OAuth port).
- **External links** — every `http(s)` link (including the ChatGPT authorize page) opens in
  the system browser; the app window never navigates away.
- **Menu** — the default menu is replaced by a minimal one (Reload / zoom / fullscreen /
  Quit, DevTools in dev); macOS keeps its app menu.
- **Layout** — `dist-electron/` (esbuild output) and `dist/` (electron-builder output) are
  git-ignored; `electron-builder.yml` ships `.next/standalone` as `resources/app`, i.e.
  **outside** the asar archive so `node server.js` can run from a real folder.

## Releases & auto-update

`.github/workflows/release.yml` runs on every push to `main` (and can be triggered
manually):

1. **version** — reads the newest `v*` git tag and computes the next patch version
   (`v1.0.0` → `v1.0.1`; `1.0.0` when no tag exists).
2. **build** — a `windows-latest` / `macos-latest` / `ubuntu-latest` matrix builds the
   installers with that version (`npm pkg set version=…`) and uploads them as artifacts.
3. **release** — creates the `vX.Y.Z` GitHub release with all installers plus the
   `latest*.yml` metadata electron-updater reads. The tag is created by the workflow and
   never committed back, so a run cannot trigger itself.

**Auto-update:** enabled on **Windows** and **Linux** — the app checks on launch and shows
a toast ("Downloading update…", then "Update ready — it installs when you quit"). macOS
builds are **not** code-signed, so auto-update is intentionally **disabled** there
(`electron/main.ts`); macOS users install a new version from the GitHub release manually
(unsigned app → Gatekeeper "right-click → Open" the first time). Windows shows a
SmartScreen warning on first run — also expected for an unsigned build.

## Prisma + SQLite (optional)

`prisma/schema.prisma` mirrors the project's data model one-to-one. In environments where
Prisma's `query engine` binary can be generated, switching the file-based store to Prisma
only requires rewriting the function bodies in `src/lib/db.ts` to Prisma calls with the
same signatures (the abstraction exists exactly for this):

```bash
echo 'DATABASE_URL="file:./dev.db"' >> .env
npx prisma generate
npx prisma migrate dev --name init
```

## API routes

| Route | Description |
| --- | --- |
| `GET/POST /api/projects` | list projects / create project |
| `GET/PATCH/DELETE /api/projects/[id]` | project detail / update / delete |
| `GET/POST /api/projects/[id]/phases` | list phases / create phase |
| `POST /api/projects/[id]/phases/reorder` | reorder phases |
| `PATCH/DELETE /api/phases/[id]` | update / delete phase |
| `POST /api/phases/[id]/tasks` | create task |
| `PATCH/DELETE /api/tasks/[id]` | update / delete task |
| `POST /api/projects/[id]/chat` | streaming AI answer + plan application (NDJSON) |
| `GET/PUT /api/settings` | provider and model settings (keys hidden) |
| `POST /api/models` | model list for the selected provider (live catalogue for Codex) |
| `POST /api/oauth/codex/start` | start the ChatGPT login (`authUrl` + `state`) |
| `GET /api/oauth/codex/status?state=` | login status (`pending` / `connected` / `error`) |
| `GET /api/projects/[id]/export` | export a single project |
| `GET /api/export` | export all data |
| `POST /api/projects/import` | import a project / backup |
| `DELETE /api/data` | delete all projects |

## Architecture notes

- **AI abstraction** — `src/lib/ai/`: provider adapters (OpenAI, Anthropic, Codex)
  implement a shared `AIProvider` interface; SSE differences are normalized inside the
  adapter.
- **Codex isolation** — the unofficial OAuth flow is confined to `codex-oauth.ts`,
  `codex-auth-server.ts`, `codex-token.ts` and `codex.ts`; if the flow changes it is fixed
  in one place.
- **Streaming + JSON** — the system prompt asks the model for free-form text first and a
  single ```` ```json ```` block at the very end. The server buffers the stream, extracts
  the JSON once it sees the closing fence, and hides the JSON part while the body text
  streams.
- **Update strategy** — the AI updates an existing phase by sending its `id`; a missing
  `id` appends a new phase. **Nothing is ever deleted** (to avoid data loss; the user
  deletes manually). Tasks are matched by task text: when the AI does not send a new
  description/notes, the notes and `done` state the user wrote are preserved.
- **Invalid JSON** — if parsing fails the phases are left untouched and the user sees an
  "the AI could not produce a valid plan" warning.
- **Storage abstraction** — all data access is centralized in `src/lib/db.ts`.
- **Context window** — the prompt receives the last 20 messages plus a phase summary.

## Tests

```bash
# Playwright end-to-end tests (with the dev server running)
npx playwright test
```

`e2e-tests/` covers dashboard project creation and phase management (add, rename, task,
task description/notes, status, copy, delete), the Codex provider UI, and the desktop
release wiring (packaged entry point, standalone handoff and workflow).

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Shadcn/UI · Electron +
electron-builder · Prisma (reference schema) · `@dnd-kit` · `next-themes` · Sonner · Zod ·
Recharts.
