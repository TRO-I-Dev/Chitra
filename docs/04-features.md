# 4. Features

## 4.1 Cards — typed units of thought

Every piece of writing becomes a **Card** with a semantic type:

| Type | Use for |
|---|---|
| `goal` | Objectives, vision, target outcomes |
| `component` | Services, modules, APIs, infrastructure |
| `persona` | Customers, users, stakeholders |
| `metric` | KPIs, north-star numbers, SLAs |
| `risk` | Threats, blockers, concerns |
| `step` | Process steps, runbook items |
| `note` | Free-form annotation |
| `decision` | ADR-style "we chose X" entries |
| `data` | Schemas, tables, entities |

Each card carries:
- A title and rich-text body (TipTap-shaped JSON).
- Optional `style` overrides (bg, stroke, accent, radius, shadow,
  border, text colour).
- Tags, metadata, source (`typed` | `pasted` | `imported`).
- ISO `createdAt` / `updatedAt` timestamps.

A heuristic **classifier** (`@chitra/composer`) suggests a type from
the prose using keyword + structural rules (numbers with units →
`metric`, imperatives → `step`, "we will" → `decision`, etc.).

## 4.2 Studio canvas

Powered by **React Flow** (`@xyflow/react`).

- **Infinite pan/zoom** with viewport bookmarking.
- **Snap engine** with live alignment guides.
- **Auto-layout** via dagre (`autoLayout.ts`).
- **Edge routing** that avoids passing through unrelated nodes
  (`routeAvoid.ts`).
- **Frame nodes** — titled containers for grouping.
- **Sketch overlay** — lazy-loaded Excalidraw layer for hand-drawn
  annotation that lives inside the same project.

### Edge semantics

Edges carry both a **kind** (semantic) and a **shape** (geometric):

| Kind | Default look | Meaning |
|---|---|---|
| `straight` | thin line | generic |
| `depends-on` | arrow head | A needs B |
| `sequence` | numbered | ordered step |
| `contains` | bracketed | composition |
| `conflicts-with` | dashed red | tension/tradeoff |
| `informs` | dotted | soft dependency |
| `flows-to` | bold arrow | data/control flow |

Each edge can carry a centre label, a rich description (above/below
the midline, with optional pill background), and a secondary label
(commonly used for cardinality `1..*`).

## 4.3 Themes & palettes

A project-wide **theme** holds:
- A **palette** (built-in or user-defined) — 14 named colour tokens
  applied as CSS custom properties at the document root.
- A **font** (system / bundled / Google Fonts — lazy `<link>`
  injection for Google).
- Defaults for new cards / edges / board backgrounds.

Per-board, per-card, and per-edge overrides cascade on top.

### Backgrounds

Eight background kinds: `studio` (animated blob wash, default), `solid`,
`dots`, `grid`, `lines`, `iso` (isometric), `gradient`, `image`.

## 4.4 Templates

Built-in board recipes ship with `@chitra/templates`:

| Template | Category |
|---|---|
| Lean Canvas | strategy |
| Business Model Canvas | strategy |
| SWOT Analysis | strategy |
| C4 Context | architecture |
| User Journey | product |
| OKR Tree | planning |
| Roadmap — Now / Next / Later | planning |

Open with `Cmd/Ctrl+T`. Each template is pure data (no DOM/Node APIs)
so it can run anywhere.

## 4.5 Composer

The Composer view is the **prose-first input lane**:
- Type or paste text.
- See the classifier's suggestion in real time.
- Accept, override the type, then commit — the card lands in the
  Inbox, ready to drag onto the canvas.

Optional **AI compose** (`aiCompose.ts`) calls the configured provider
to refine titles, generate summaries, or expand a one-liner into a
full body.

## 4.6 Exports

| Format | Function | What it produces |
|---|---|---|
| **Markdown** | `exportMarkdown` | Topo-sorted prose document |
| **Interactive HTML** | `exportInteractiveHtml` | Self-contained HTML viewer |
| **Embed snippet** | `exportEmbedSnippet` | `<iframe>`-ready HTML |
| **PNG** | `exportPng` | Rasterised canvas via `html-to-image` |
| **SVG** | `exportSvg` | Vector canvas |
| **PDF** | `exportPdf` | Browser print pipeline |
| **DOCX** | `exportDocx` | Word document via `docx` |
| **JSON** | `exportJson` | Raw `Project` for tooling |
| **Mermaid** | `exportMermaid` | Mermaid diagram source |
| **Notion** | `publishNotion` | Pushes to a Notion page (BYO token) |
| **Confluence** | `publishConfluence` | Pushes to a Confluence page (BYO token) |

## 4.7 Decision Log

`DecisionLog.tsx` is a dedicated, filtered view that lists every card
of type `decision` in chronological order — effectively a built-in ADR
log without leaving the project.

## 4.8 Inbox

`Inbox.tsx` collects pasted or imported cards that haven't been placed
on a board yet. Drag-drop onto any board to materialise as a node.

## 4.9 Command palette

`Cmd/Ctrl+K` opens a fuzzy-search palette (powered by `cmdk`) that
exposes every menu action: new project, open, save, export, switch
template, toggle theme, jump to a card, etc.

## 4.10 AI assistance (opt-in, BYO key)

- Pluggable providers: **OpenAI**, **Anthropic**, **Ollama**.
- Single `complete()` interface (`AiProvider`).
- Uses: refine prose, classify ambiguous cards, *Explain this diagram*,
  generate a board from a brief.
- Keys are stored encrypted at rest in IndexedDB
  (`platform/secrets.ts`); a passphrase prompt unlocks them per session.

## 4.11 Local-first persistence

- **IndexedDB** holds: recents, FS Access handles, settings, encrypted
  secrets, and an optional auto-save buffer.
- **Disk** holds the canonical `.chitra` zip.
- **Service Worker** caches every shipped asset (`vite-plugin-pwa`)
  with `clientsClaim + skipWaiting` so deploys don't strand stale
  chunks.
