# 1. Overview

## What is Chitra?

**Chitra** (Sanskrit: *चित्र*, "picture / diagram") is a **local-first
visual planning studio** that turns prose into structured, exportable
diagrams. It is designed for architects, founders, product managers, and
engineering leads who think on paper but need to ship an artefact —
a deck, an ADR, a Confluence page, a one-page plan — without leaving
their browser.

The core flow is simple:

1. **Write.** Drop a paragraph into the composer. Chitra's heuristic
   classifier proposes a card type (goal, risk, metric, persona,
   component, step, decision, data, note).
2. **Arrange.** Cards land on an infinite studio canvas. Connect them
   with semantic edges (`depends-on`, `sequence`, `flows-to`,
   `conflicts-with`, …). Snap, align, auto-layout.
3. **Style.** Pick a palette, font, and background. Override per card
   or per edge.
4. **Export.** PDF, Markdown, PNG, SVG, Interactive HTML, DOCX, Notion,
   Confluence — or share the portable `.chitra` archive.

## Design principles

| Principle | What it means in practice |
|---|---|
| **Local-first** | All data lives in the browser (IndexedDB) and on disk as a `.chitra` zip. No server, no account, no telemetry. |
| **Offline-capable** | Installs as a PWA. Works on a plane after the first load. |
| **Portable** | The project file is a plain zip with manifest + JSON. You own the data. |
| **Typed primitives** | Every card has a semantic type. Templates are pure data. Schemas are validated with `zod`. |
| **Keyboard-first** | Command palette (`Cmd/Ctrl+K`) drives every action. |
| **No backend dependency** | AI, publishing, exports — all run in the browser; keys stay on-device. |

## Who is it for?

- **Architects** drafting C4 / context diagrams alongside ADRs.
- **Founders** turning a brain-dump into a Lean Canvas or BMC.
- **Product managers** sketching user journeys, OKR trees, roadmaps.
- **Tech leads** documenting decisions and dependencies in one
  artefact.

## What it is *not*

- Not a replacement for Figma / Miro for free-form whiteboarding
  (though it ships an Excalidraw sketch overlay for annotation).
- Not a wiki — there is no shared workspace, no real-time multi-user
  editing. Chitra is a **single-author, file-based** tool by design.
- Not an LLM front-end — AI assistance is opt-in, BYO-key, and used
  only as an *enhancer* for cards & explanations.
