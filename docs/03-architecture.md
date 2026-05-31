# 3. Architecture

## 3.1 High-level system view

Chitra is a **single-page PWA**. The entire application — UI, state,
persistence, exports, AI calls — runs inside the user's browser tab.
There is no Chitra server.

```mermaid
flowchart LR
    subgraph Browser["Browser tab (PWA)"]
        UI[React UI<br/>views + canvas]
        Store[Zustand<br/>projectStore]
        Platform[Platform adapter<br/>apps/web/src/platform/*]
        IDB[(IndexedDB<br/>recents, secrets,<br/>file handles)]
        SW[Service Worker<br/>offline cache]
    end

    Disk[(Disk<br/>.chitra zip)]
    OpenAI[(OpenAI API)]
    Anthropic[(Anthropic API)]
    Ollama[(Local Ollama)]
    Notion[(Notion API)]
    Conf[(Confluence API)]

    UI <--> Store
    Store <--> Platform
    Platform <--> IDB
    Platform <-->|FS Access API<br/>or download| Disk
    Platform -.optional BYO key.-> OpenAI
    Platform -.optional BYO key.-> Anthropic
    Platform -.optional.-> Ollama
    Platform -.optional.-> Notion
    Platform -.optional.-> Conf
    SW -.caches.-> UI
```

Key invariant: **every dotted edge is opt-in**. A user who never opens
Settings sees zero outbound network traffic after the initial PWA load.

## 3.2 Monorepo layout

```mermaid
flowchart TB
    Web["apps/web<br/>(Vite + React PWA)"]
    Core["packages/core<br/>types & zod schemas"]
    Composer["packages/composer<br/>card composer + classifier"]
    Templates["packages/templates<br/>built-in board recipes"]
    Exports["packages/exports<br/>md / html / mermaid / docx helpers"]

    Web --> Core
    Web --> Composer
    Web --> Templates
    Web --> Exports
    Composer --> Core
    Templates --> Core
    Exports --> Core
```

`packages/core` is the **single source of truth** for the data model.
Every other package imports its types from there; nothing imports
"upward" toward `apps/web`.

## 3.3 Web app internal structure

```
apps/web/src/
├── App.tsx                  ← Root: routes between Welcome / Workspace / Onboarding
├── main.tsx                 ← Vite entry; mounts <App />
├── views/                   ← Top-level screens
│   ├── Welcome.tsx          ← Landing / recents / new project
│   ├── Workspace.tsx        ← The studio (canvas + side panels)
│   ├── Composer.tsx         ← Writing pane → typed card
│   ├── CardInspector.tsx    ← Per-card style & metadata editor
│   ├── DecisionLog.tsx      ← Filtered view of "decision" cards
│   ├── ExportMenu.tsx       ← Export dispatcher
│   ├── Inbox.tsx            ← Pasted/imported cards awaiting placement
│   ├── Onboarding.tsx       ← First-run tour
│   ├── Settings.tsx         ← AI keys, theme, recents
│   ├── Templates.tsx        ← Pick a template → seed a board
│   └── ThemeStudio.tsx      ← Palette / font / background editor
├── canvas/                  ← React Flow integration
│   ├── Canvas.tsx           ← Main canvas; nodes, edges, selection
│   ├── CardNode.tsx         ← React Flow node renderer for a Card
│   ├── FrameNode.tsx        ← Container/frame nodes
│   ├── ChitraEdge.tsx       ← Custom edge w/ labels & descriptions
│   ├── autoLayout.ts        ← dagre-driven layout
│   ├── snapEngine.ts        ← Snapping & alignment guides
│   ├── routeAvoid.ts        ← Path routing that avoids node bodies
│   ├── SketchOverlay.tsx    ← Excalidraw layer (lazy)
│   ├── BackgroundPanel.tsx  ← Per-board background editor
│   └── …
├── composer/                ← Writing → cards
│   ├── composeMarkdown.ts
│   ├── aiCompose.ts         ← Optional LLM enhancement
│   └── explainDiagram.ts    ← "Explain this board" → text
├── exports/                 ← Output adapters
│   ├── runExport.ts         ← exportMarkdown / exportPdf / exportPng / …
│   ├── docxBuilder.ts
│   └── importTable.ts
├── platform/                ← Browser-side capabilities
│   ├── projectFs.ts         ← New / Open / Save / SaveAs (.chitra)
│   ├── handleStore.ts       ← Persisted FS Access handles in IDB
│   ├── recents.ts
│   ├── settings.ts
│   ├── secrets.ts           ← Encrypted at-rest storage for AI keys
│   ├── menu.ts              ← In-app command bus
│   ├── fileSave.ts          ← Save-with-fallback helper
│   ├── exportPdf.ts         ← Browser print → PDF
│   ├── ai/                  ← openai.ts | anthropic.ts | ollama.ts
│   └── publish/             ← notion.ts | confluence.ts
├── state/
│   ├── projectStore.ts      ← Zustand store (the entire app state)
│   ├── paletteEngine.ts     ← Applies palette tokens to :root
│   ├── theme.ts
│   └── mode.ts
├── components/              ← Cross-cutting UI: CommandPalette, PassphrasePrompt
├── hooks/useHotkeys.ts
├── samples/sampleProject.ts
└── brand/Logo.tsx
```

## 3.4 Data flow — write a card to canvas

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Composer as Composer view
    participant Classifier as @chitra/composer<br/>classify()
    participant Store as Zustand projectStore
    participant Canvas as Canvas (React Flow)

    User->>Composer: types text + Enter
    Composer->>Classifier: classify(text)
    Classifier-->>Composer: { type, confidence, reason }
    Composer->>Store: addCard({ title, body, type })
    Store-->>Store: nanoid id, ISO timestamps,<br/>mark dirty=true
    Store->>Canvas: state subscription fires
    Canvas->>Canvas: addNodeFromCard(cardId, position)
    Canvas-->>User: card appears on board
```

## 3.5 Persistence flow — save project

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI
    participant Platform as platform.projectSave
    participant FS as projectFs.ts
    participant IDB as IndexedDB<br/>(handleStore)
    participant Disk

    User->>UI: Cmd+S
    UI->>Platform: projectSave(handleId, project)
    alt has handle
        Platform->>FS: projectSaveExisting
        FS->>IDB: lookup file handle by id
        IDB-->>FS: FileSystemFileHandle
        FS->>FS: serialize Project → JSON<br/>+ manifest → fflate zip
        FS->>Disk: writable.write(zip)
    else no handle
        Platform->>FS: projectSaveAs
        FS->>User: Save picker (FS Access)<br/>or download fallback
        User-->>FS: pick location
        FS->>IDB: persist new handle
        FS->>Disk: write zip
    end
    Platform-->>UI: { path, savedAt, handleId }
    UI->>UI: store.markSaved(...)
```

## 3.6 The `.chitra` archive format

A `.chitra` file is a plain zip produced by `fflate`:

```
my-plan.chitra (zip)
├── manifest.json     ← { app: "chitra", schemaVersion, appVersion, … }
├── project.json      ← The full Project (cards, boards, palettes, theme)
└── (future: assets/, attachments/, …)
```

Validated against `ProjectManifest` and `Project` zod schemas in
[`packages/core/src/schemas.ts`](../packages/core/src/schemas.ts) on every
open. Schema mismatches are reported with a precise zod path so the user
knows which field broke.
