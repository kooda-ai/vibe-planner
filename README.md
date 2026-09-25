# Vibe Planner — AI Project Planner

A single-user web app that splits a project idea into **phases** by chatting with an AI,
lets you manage each phase with a task list + notes + status, and copies any phase into your
**vibe coder** (e.g. Dyad) with one click.

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
task description/notes, status, copy, delete).

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Shadcn/UI · Prisma (reference schema) ·
`@dnd-kit` · `next-themes` · Sonner · Zod · Recharts.
