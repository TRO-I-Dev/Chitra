# 6. Project Structure

## 6.1 Repository root

```
chitra/
├── apps/
│   ├── web/                 ← Vite + React PWA (the shipped app)
│   └── desktop/             ← (placeholder, currently empty out/ + node_modules)
├── packages/
│   ├── core/                ← Domain types & zod schemas
│   ├── composer/            ← Card composer + heuristic classifier
│   ├── templates/           ← Built-in board recipes
│   └── exports/             ← Pure export helpers (md / html / mermaid / docx)
├── tools/                   ← Debug / visual-regression scripts
│   ├── debug-canvas.mjs
│   ├── debug-drag.mjs
│   ├── debug-node-inner.mjs
│   ├── debug-sample-vis.mjs
│   ├── debug-visual.mjs
│   └── debug-shots/
├── biome.json               ← Biome lint + format config
├── netlify.toml             ← Netlify build/deploy
├── package.json             ← Root scripts & devDeps
├── pnpm-lock.yaml
├── pnpm-workspace.yaml      ← Workspaces: apps/web + packages/*
├── tsconfig.base.json       ← Strict TS base config
└── README.md
```

## 6.2 `packages/core`

The data-model package. Imports nothing from the rest of the monorepo.

```
packages/core/src/
├── index.ts                 ← APP_NAME, PROJECT_FILE_EXT, PROJECT_SCHEMA_VERSION
└── schemas.ts               ← zod schemas for the entire .chitra format
```

Defines: `Card`, `CardType`, `CardStyle`, `BoardNode`, `BoardEdge`,
`EdgeKind`, `EdgeShape`, `EdgeDescription`, `BoardBackground`, `Board`,
`Palette`, `PaletteTokens`, `FontConfig`, `ProjectTheme`, `Project`,
`ProjectManifest`, `RecentProject`.

## 6.3 `packages/composer`

Heuristic classifier + composer types.

- `classify(text)` → ranked `ClassifierSuggestion[]`
- Keyword + structural rules (regexes for units, imperatives,
  obligation modals, bullet-list shapes).

## 6.4 `packages/templates`

```
packages/templates/src/
├── index.ts
├── types.ts                 ← Template / TemplateCard / TemplateNode shapes
└── registry.ts              ← The seven built-in templates
```

Each template's `build()` returns a pure `{ boardName, cards, nodes,
edges }` payload that the project store materialises into real cards
and a board.

## 6.5 `packages/exports`

Pure functions over a `Project`:

- `flattenBody(card)` — TipTap → plain text
- `topoOrder(nodes, edges)` — Kahn's algorithm, cycle-safe
- `projectToMarkdown(project)`
- `projectToInteractiveHtml(project)`
- `projectToEmbedSnippet(project)`
- `projectToPrintHtml(project)`
- `projectToMermaid(project)`

`apps/web/src/exports/docxBuilder.ts` and `runExport.ts` consume these
and pair them with browser-only output (PNG/SVG/PDF/save dialogs).

## 6.6 `apps/web`

See [03-architecture.md](03-architecture.md#33-web-app-internal-structure)
for the in-depth tour. Key contracts:

- **`platform/index.ts`** — the only API the rest of the renderer uses
  for OS-shaped capabilities (open/save, recents, secrets, AI,
  publish, menu/command bus). It mirrors what an Electron preload
  bridge would have exposed, so a desktop wrapper is a future
  drop-in.
- **`state/projectStore.ts`** — every piece of mutable app state lives
  here. The store owns project loading, dirty tracking, history, and
  every CRUD operation on cards / nodes / edges / boards / palettes.

## 6.7 TypeScript project graph

```
tsconfig.base.json
    ├── packages/core/tsconfig.json
    ├── packages/composer/tsconfig.json     → references core
    ├── packages/templates/tsconfig.json    → references core
    ├── packages/exports/tsconfig.json      → references core
    └── apps/web/tsconfig.json              → references all four
```

`pnpm typecheck` runs `tsc --noEmit` in each package via the recursive
`-r` filter; the build step uses `tsc -b` (project references) so
incremental rebuilds are fast.
