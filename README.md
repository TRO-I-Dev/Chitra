# Chitra

Writing-to-card studio for architecture & business plans. A local-first **web app (PWA)** where a piece of writing becomes a typed **card**, cards arrange on an infinite **studio canvas** to form flows, and the result exports to PDF / Markdown / PNG / SVG / Interactive HTML / DOCX / Notion / Confluence.

Projects live in your browser (IndexedDB) and as portable `.chitra` archives on disk via the File System Access API. No backend, no telemetry, no account.

## Stack

React 18 + TypeScript (strict) · Vite 5 · Tailwind v4 · React Flow (`@xyflow/react`) · Konva · Excalidraw · Zustand · zod · idb · fflate · framer-motion · sonner · cmdk · vite-plugin-pwa · Biome · Vitest.

## Development

```powershell
pnpm install
pnpm dev          # serves apps/web on http://localhost:5173
pnpm build        # builds packages, then the PWA into apps/web/dist
pnpm preview      # serves the built PWA locally
pnpm typecheck
pnpm lint
```

## Workspace layout

```
apps/web              # Vite + React PWA (the app)
packages/core         # Shared types & zod schemas
packages/composer     # Card composer + heuristic classifier
packages/templates    # Built-in templates
packages/exports      # Export helpers (DOCX builder, etc.)
```

## Browser support

The full save-in-place experience needs the File System Access API (Chrome, Edge, Brave, Opera, Arc). Firefox and Safari fall back to file picker + downloads. The PWA installs on Chromium browsers and runs offline after first load.

## Keyboard

`Cmd/Ctrl + K` opens the command palette. `Cmd/Ctrl + ,` opens settings. `Cmd/Ctrl + T` opens templates. `Cmd/Ctrl + O` opens a project. `Cmd/Ctrl + Shift + N` starts a new one.
