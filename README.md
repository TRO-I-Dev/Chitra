# Chitra

Writing-to-card studio for architecture & business plans. A stylish Windows desktop app where a piece of writing becomes a typed **card**, cards arrange on an infinite **studio canvas** to form flows, and the result exports to PDF / Markdown / PNG-SVG / Interactive HTML / DOCX / Notion / Confluence.

## Stack

Electron 32 · React 18 + TypeScript (strict) · Tailwind v4 + shadcn/ui · React Flow · Konva · Excalidraw · TipTap · Yjs · better-sqlite3 · pnpm monorepo · Biome · Vitest · Playwright.

## Development

```powershell
pnpm install
pnpm dev
```

## Workspace layout

```
apps/desktop          # Electron shell (main / preload / renderer)
packages/core         # Shared types, zod schemas, IPC contracts
packages/canvas       # React Flow node/edge components, Konva background  (later)
packages/composer     # Card composer + heuristic classifier              (later)
packages/templates    # Built-in templates                                 (later)
packages/exporters    # PDF, MD, PNG, HTML, DOCX, Notion, Confluence      (later)
packages/viewer       # Standalone Preact viewer for Interactive HTML     (later)
```

See [memories/session/plan.md](./memories/session/plan.md) for the full multi-phase plan.
