# 5. Getting Started

## 5.1 Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | `>= 20.11.0` | matches `engines.node` |
| **pnpm** | `9.12.0` (pinned) | enforced via `packageManager` field |
| A modern Chromium browser | latest | for the full save-in-place experience |

> `corepack enable` will pick up the pinned pnpm automatically.

## 5.2 Clone & install

```powershell
git clone <your-fork-url> chitra
cd chitra
pnpm install
```

`pnpm install` resolves the workspace and links the four internal
packages (`@chitra/core`, `@chitra/composer`, `@chitra/templates`,
`@chitra/exports`) into `apps/web`.

> ⚠️ Do **not** run `pnpm install --force` after editing
> `pnpm-workspace.yaml` — it can wipe workspace package source. Plain
> `pnpm install` is always safe.

## 5.3 Run the app

```powershell
pnpm dev
```

Serves the web app on **http://localhost:5173**. Hot-module reload is
enabled. The service worker is **disabled in dev** so HMR is never
served from a stale cache.

## 5.4 Build for production

```powershell
pnpm build
```

This runs in two phases:

1. `pnpm -r --filter "./packages/*" build` — compiles each workspace
   package (`tsc -b`) into its `dist/`.
2. `pnpm --filter @chitra/web build` — Vite produces
   `apps/web/dist/` (the deployable PWA).

## 5.5 Preview the production build

```powershell
pnpm preview
```

Serves `apps/web/dist/` on **http://localhost:4179** with the real
service worker enabled — useful for verifying PWA install / offline
behaviour before deploying.

## 5.6 Quality gates

```powershell
pnpm typecheck   # tsc --noEmit, every workspace
pnpm lint        # biome check .
pnpm format      # biome format --write .
pnpm test        # vitest run (apps/web)
```

## 5.7 First run

1. Open http://localhost:5173.
2. Click **New project** (or press `Cmd/Ctrl + Shift + N`).
3. Press `Cmd/Ctrl + T` to pick a template, or just start writing in
   the Composer.
4. Press `Cmd/Ctrl + S` to save — Chitra writes a `.chitra` archive
   to disk.

## 5.8 Configuring AI (optional)

1. Open **Settings** (`Cmd/Ctrl + ,`).
2. Pick a provider (OpenAI / Anthropic / Ollama).
3. Paste your API key (or a base URL for Ollama).
4. Set a passphrase — keys are encrypted at rest in IndexedDB.

No key, no AI calls. The classifier and every export work without one.

## 5.9 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `tsc: not found` on Netlify | `NODE_ENV=production` was set, so pnpm skipped devDeps | Leave `NODE_ENV` unset; rely on Vite's internal production mode |
| Hard reload still shows old build | Service worker cached a stale shell | Already mitigated by `clientsClaim + skipWaiting`; otherwise empty cache + reload |
| "process is not defined" from Excalidraw | Build-time `define:` substitution missing | Already handled in `vite.config.ts` (`process.env.IS_PREACT`, `NODE_ENV`) |
| Save dialog doesn't appear | Browser without File System Access API | Falls back to file-download; supported on Chromium browsers |
