# 7. Data Model

All schemas are declared once in
[`packages/core/src/schemas.ts`](../packages/core/src/schemas.ts) using
**zod**, then `z.infer`'d into TypeScript types. The same schemas
validate `.chitra` files on open, so the contract is enforced at every
boundary.

## 7.1 Entity diagram

```mermaid
classDiagram
    class Project {
        string id
        string name
        int schemaVersion
        string createdAt
        string updatedAt
        Card[] cards
        Board[] boards
        Palette[] palettes
        ProjectTheme? theme
    }

    class Card {
        string id
        CardType type
        string title
        RichDoc body
        string[] tags
        CardStyle? style
        CardSource source
        string createdAt
        string updatedAt
    }

    class Board {
        string id
        string name
        string? templateId
        BoardNode[] nodes
        BoardEdge[] edges
        BoardBackground? background
        object? sketch
    }

    class BoardNode {
        string id
        string cardId
        NodePosition position
        number? width
        number? height
        string? parentId
        bool locked
        bool? frame
        string? frameColor
    }

    class BoardEdge {
        string id
        string source
        string target
        string? sourceHandle
        string? targetHandle
        EdgeKind kind
        string? label
        EdgeStyleOverride? style
        EdgeDescription? description
        EdgeDescription? secondaryLabel
    }

    class Palette {
        string id
        string label
        PaletteTokens tokens
    }

    class ProjectTheme {
        string? paletteId
        FontConfig? font
        CardStyle? defaultCardStyle
        EdgeStyleOverride? defaultEdgeStyle
        BoardBackground? defaultBackground
    }

    Project "1" o-- "*" Card
    Project "1" o-- "*" Board
    Project "1" o-- "*" Palette
    Project "1" o-- "0..1" ProjectTheme
    Board "1" o-- "*" BoardNode
    Board "1" o-- "*" BoardEdge
    BoardNode "*" --> "1" Card : cardId
```

## 7.2 Enumerations

| Enum | Members |
|---|---|
| `CardType` | `goal`, `component`, `persona`, `metric`, `risk`, `step`, `note`, `decision`, `data` |
| `CardSource` | `typed`, `pasted`, `imported` |
| `CardBorderStyle` | `solid`, `dashed`, `dotted`, `none` |
| `CardShadowPreset` | `none`, `soft`, `lift`, `pop` |
| `EdgeKind` | `straight`, `depends-on`, `sequence`, `contains`, `conflicts-with`, `informs`, `flows-to` |
| `EdgeShape` | `straight`, `smoothstep`, `step`, `bezier`, `avoid` |
| `EdgeDash` | `solid`, `dashed`, `dotted` |
| `EdgeLabelPlacement` | `above`, `center`, `below` |
| `BackgroundKind` | `studio`, `solid`, `dots`, `grid`, `lines`, `iso`, `gradient`, `image` |
| `FontSource` | `system`, `bundled`, `google` |

## 7.3 The `.chitra` archive

A zip produced by `fflate`:

```
my-plan.chitra
├── manifest.json   ← ProjectManifest { app, schemaVersion, appVersion, … }
└── project.json    ← Project (validated by zod on open)
```

`PROJECT_SCHEMA_VERSION` is `1`. Versioned migration is intentionally
deferred until v2 — opening a future file with a higher schemaVersion
than the current build supports surfaces a clear error.

## 7.4 In-browser persistence

| Store | Backed by | Holds |
|---|---|---|
| `recents` | IndexedDB | last-opened projects + handle ids + thumbnails |
| `handleStore` | IndexedDB | `FileSystemFileHandle` per `handleId` |
| `settings` | IndexedDB | preferences (provider, palette default, etc.) |
| `secrets` | IndexedDB (encrypted) | AI keys, publish tokens — unlocked by passphrase |
| service-worker caches | Cache API | shipped JS/CSS/HTML/fonts/Excalidraw vendor chunks |
