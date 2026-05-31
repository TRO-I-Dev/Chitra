# 2. Tech Stack

## Runtime

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript 5.6** (strict, `exactOptionalPropertyTypes`) | All packages |
| UI framework | **React 18.3** | Function components, hooks-only |
| State | **Zustand 5** | Single project store (`projectStore.ts`) |
| Validation | **zod 3** | Runtime schema for the entire `.chitra` file format |
| Styling | **Tailwind CSS v4 (beta)** + CSS custom properties | Palette tokens applied at the document root |
| Animation | **framer-motion 11** | View transitions, micro-interactions |
| Toasts | **sonner** | Inline notifications |
| Command palette | **cmdk** | `Cmd/Ctrl+K` |

## Canvas & graphics

| Library | Purpose |
|---|---|
| **@xyflow/react 12** (React Flow) | Studio canvas — nodes, edges, viewport |
| **@dagrejs/dagre** | Auto-layout (DAG layering) |
| **Konva** + **react-konva** | Off-thread rendering for performance-critical overlays |
| **@excalidraw/excalidraw** | Sketch overlay (lazy-loaded) |
| **html-to-image** | DOM → PNG/SVG export |

## Persistence

| Library | Purpose |
|---|---|
| **idb** | IndexedDB wrapper for in-browser projects, recents, secrets |
| **fflate** | Build & parse `.chitra` zip archives |
| **File System Access API** | Save-in-place on Chromium browsers |

## Exports

| Library | Purpose |
|---|---|
| **docx 8** | DOCX builder for `Export → Word` |
| Native print pipeline | PDF via the browser's print-to-PDF |
| `projectToMarkdown` / `projectToInteractiveHtml` / `projectToMermaid` | Pure functions in `@chitra/exports` |

## AI providers (optional, BYO key)

- **OpenAI** (Chat Completions)
- **Anthropic** (Messages API)
- **Ollama** (local, no key — base URL only)

## Build tooling

| Tool | Role |
|---|---|
| **pnpm 9** workspaces | Monorepo dependency management |
| **Vite 5** | Dev server + production bundler |
| **vite-plugin-pwa** | Service worker, web manifest, offline cache |
| **rollup-plugin-visualizer** | Bundle analysis |
| **Biome 1.9** | Linting + formatting (single tool, replaces ESLint/Prettier) |
| **Vitest 2** | Unit & component tests |
| **TypeScript Project References** | Per-package incremental builds |

## Deployment

- **Netlify** for the public PWA build (see [`netlify.toml`](../netlify.toml)).
- A bare static-host deploy works just as well — the build is a single
  `apps/web/dist/` folder.

## Browser support

| Browser | Save-in-place | PWA install | Offline |
|---|---|---|---|
| Chrome / Edge / Brave / Opera / Arc | ✅ (File System Access API) | ✅ | ✅ |
| Firefox | ⚠️ download fallback | ❌ | ✅ |
| Safari | ⚠️ download fallback | ❌ | ✅ |
