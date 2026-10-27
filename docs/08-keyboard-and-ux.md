# 8. Keyboard & UX

## 8.1 Global shortcuts

Defined in [`apps/web/src/hooks/useHotkeys.ts`](../apps/web/src/hooks/useHotkeys.ts).
These work from anywhere in the app.

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Open the **Command Palette** |
| `Cmd/Ctrl + ,` | Open **Settings** |
| `Cmd/Ctrl + T` | Open **Templates** |
| `Cmd/Ctrl + O` | **Open** a `.chitra` project |
| `Cmd/Ctrl + Shift + N` | **New** project |

> Shortcuts that begin with `Cmd/Ctrl` (other than `K`) are suppressed
> while focus is inside an `<input>`, `<textarea>`, or contenteditable
> region — so typing a `,` in the Composer doesn't open Settings.

## 8.2 Workspace-scoped shortcuts

Owned by `views/Workspace.tsx` and the canvas:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + S` | Save (Save As if no handle yet) |
| `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` | Undo / Redo |
| `Cmd/Ctrl + A` | Select all nodes on the active board |
| `Delete` / `Backspace` | Remove selected nodes/edges |
| `Cmd/Ctrl + D` | Duplicate selection |
| Arrow keys | Nudge selected nodes |
| `Shift + drag` | Multi-select |
| `Cmd/Ctrl + 1` | **Structure** mode |
| `Cmd/Ctrl + 2` | **Sketch** mode |
| `Cmd/Ctrl + 3` | **Air Board** mode (camera hand tracking) |

### Air Board

While Air Board is active (see [11-air-board.md](11-air-board.md)):

| Input | Action |
|---|---|
| `R` | Toggle the radial tool ring |
| `Esc` | Close the tool ring |
| **Open palm** | Open the tool ring; move to browse it |
| **Fist** | Choose the highlighted option |
| **Point** (index finger) | Draw at the fingertip |
| Pinch (thumb+index) | Draw — steadier alternative to pointing |
| Middle pinch | Erase |
| Two fingers | Pan the sketch scene |
| Thumbs up | Force shape snapping on the current stroke |
| L shape | Undo the last air-committed element |
| Hold cursor still | Dwell click — a fist-free confirm |

The loop is **open palm → browse → close fist → chosen → point to draw**.

Every gesture above is remappable, and the defaults are only defaults
until the user runs calibration.

## 8.3 Command Palette

The palette (`components/CommandPalette.tsx`, powered by `cmdk`) is the
primary action surface. Every menu item, every export, every template,
every recent project is reachable by typing — no mouse required.

It surfaces, at minimum:

- `New project`, `Open project`, `Open recent…`, `Save`, `Save As`
- `Export → Markdown / HTML / PNG / SVG / PDF / DOCX / JSON / Mermaid`
- `Publish → Notion / Confluence`
- `Insert template → …` (the seven built-ins)
- `Open Settings`, `Open Theme Studio`, `Open Decision Log`
- `Toggle sketch overlay`

## 8.4 Onboarding

First-run flow is rendered by `views/Onboarding.tsx` and explains:

1. The four core ideas (write → arrange → style → export).
2. The local-first / no-account model.
3. Where projects live (browser + `.chitra` file).
4. How to enable AI (and that it's optional).

It only fires when no recent projects exist.

## 8.5 Beforeunload guard

`App.tsx` registers a `beforeunload` listener that warns when the
project is dirty (`store.dirty === true`), so closing the tab can
never silently throw away unsaved work.
