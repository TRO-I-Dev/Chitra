# Chitra

Writing-to-card studio for architecture & business plans. A local-first **web app (PWA)** where a piece of writing becomes a typed **card**, cards arrange on an infinite **studio canvas** to form flows, and the result exports to PDF / Markdown / PNG / SVG / Interactive HTML / DOCX / Notion / Confluence.

Projects live in your browser (IndexedDB) and as portable `.chitra` archives on disk via the File System Access API. No backend, no telemetry, no account.

## Air Board

Press `Ctrl+3` (or pick **Air Board** in the mode strip) and Chitra turns on
the webcam, tracks your hand, and makes your fingertip the cursor:

> **Open your palm** to bring up the tool ring and move your hand to browse it
> → **close your fist** to choose → **point** to draw.

A rough loop drawn in the air becomes a clean circle on the board. A
calibration wizard fits every threshold to your own hand, and every gesture is
remappable.

Ink lands in the board's normal sketch layer, so it's editable with the mouse
afterwards and exports like anything else. Hand tracking runs entirely on your
machine — **no video is recorded or transmitted**, and the camera only runs
while the mode is open.

Full design notes: [docs/11-air-board.md](docs/11-air-board.md).

## Stack

React 18 + TypeScript (strict) · Vite 5 · Tailwind v4 · React Flow (`@xyflow/react`) · Konva · Excalidraw · MediaPipe Tasks Vision · Zustand · zod · idb · fflate · framer-motion · sonner · cmdk · vite-plugin-pwa · Biome · Vitest. Desktop: Electron 32 + electron-vite + electron-builder.

## Development

```powershell
pnpm install
pnpm dev              # serves apps/web on http://127.0.0.1:5673
pnpm build            # builds packages, then the PWA into apps/web/dist
pnpm preview          # serves the built PWA locally
pnpm test             # vitest
pnpm typecheck
pnpm lint

pnpm dev:desktop      # Electron shell with HMR
pnpm build:desktop    # builds the desktop bundle into apps/desktop/out
pnpm package:desktop  # electron-builder installers into apps/desktop/release
```

Air Board's vision assets (~30 MB of WASM + model weights) are **generated,
not committed**. `pnpm airboard:assets` copies the runtime out of
`node_modules` and downloads the hand model once; it runs automatically before
every `dev` and `build`, and is a no-op afterwards. If it can't reach the
network it warns and continues — only Air Board is affected. Commit
`apps/web/public/mediapipe/` (and drop it from `.gitignore`) if you'd rather
have fully offline builds.

The desktop shell builds **the web app** as its renderer — there is no second
copy of the UI, so every feature ships on both targets from one source.

## Workspace layout

```
apps/web              # Vite + React PWA (the app, and the desktop renderer)
apps/desktop          # Electron shell: main, preload, app:// protocol, packaging
packages/core         # Shared types & zod schemas
packages/composer     # Card composer + heuristic classifier
packages/templates    # Built-in templates
packages/exports      # Export helpers (DOCX builder, etc.)
```

## Browser support

The full save-in-place experience needs the File System Access API (Chrome, Edge, Brave, Opera, Arc). Firefox and Safari fall back to file picker + downloads. The PWA installs on Chromium browsers and runs offline after first load.

## Keyboard

`Cmd/Ctrl + K` opens the command palette. `Cmd/Ctrl + ,` opens settings. `Cmd/Ctrl + T` opens templates. `Cmd/Ctrl + O` opens a project. `Cmd/Ctrl + Shift + N` starts a new one.
