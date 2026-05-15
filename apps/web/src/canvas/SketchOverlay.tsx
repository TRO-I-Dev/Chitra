import { useCallback, useEffect, useRef } from "react";
import { LazyExcalidraw } from "./LazyExcalidraw.js";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types/types";
import { useCurrentBoard, useProjectStore } from "../state/projectStore.js";
import { useMode } from "../state/mode.js";

/**
 * Excalidraw overlay sitting on top of the React Flow canvas.
 *
 * - In `structure` mode the canvas is read-only (`viewModeEnabled`) and
 *   pointer-transparent so the user works with React Flow underneath.
 * - In `sketch` mode it captures pointer events and the user can draw freely.
 *
 * Sketch elements/appState are persisted on the current Board so they save
 * with the project.
 */
export function SketchOverlay(): JSX.Element | null {
  const board = useCurrentBoard();
  const mode = useMode((s) => s.mode);
  const setBoardSketch = useProjectStore((s) => s.setBoardSketch);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSerialized = useRef<string>("");

  // Loaded sketch — strip animations/UI state we don't want to persist.
  const initial = useCallback((): ExcalidrawInitialDataState | null => {
    if (!board?.sketch) {
      return {
        elements: [],
        appState: { viewBackgroundColor: "transparent", theme: "dark" },
        scrollToContent: false,
      };
    }
    const s = board.sketch as Partial<ExcalidrawInitialDataState>;
    return {
      elements: (s.elements as ExcalidrawInitialDataState["elements"]) ?? [],
      appState: {
        viewBackgroundColor: "transparent",
        theme: "dark",
        ...((s.appState as object) ?? {}),
      },
      scrollToContent: false,
    };
  }, [board?.sketch]);

  // When the active board changes, push its scene into Excalidraw.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const data = initial();
    if (!data) return;
    api.updateScene({
      elements: data.elements ?? [],
      // updateScene expects a complete AppState; in practice it merges over
      // the running scene, so a partial cast is correct.
      appState: data.appState as never,
    });
    lastSerialized.current = JSON.stringify({
      elements: data.elements,
      files: null,
    });
  }, [board?.id, initial]);

  if (!board) return null;
  // Only mount Excalidraw if the user has entered sketch mode at least once
  // OR the board already has sketch data — keeps the heavy chunk lazy.
  const hasSketch = !!board.sketch && Object.keys(board.sketch).length > 0;
  if (mode !== "sketch" && !hasSketch) return null;

  return (
    <div
      className="absolute inset-0"
      style={{
        // Pass-through pointer events when not actively sketching so React
        // Flow underneath stays interactive.
        pointerEvents: mode === "sketch" ? "auto" : "none",
        // The Excalidraw container manages its own background; we want our
        // studio background to show through, so force transparency.
        background: "transparent",
      }}
    >
      <LazyExcalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          apiRef.current = api;
        }}
        initialData={initial()}
        viewModeEnabled={mode !== "sketch"}
        zenModeEnabled={mode !== "sketch"}
        gridModeEnabled={false}
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: mode === "sketch",
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        onChange={(elements: readonly unknown[], appState: unknown, files: unknown) => {
          // Cheap dedupe — Excalidraw emits onChange even on hover.
          const next = JSON.stringify({ elements, files });
          if (next === lastSerialized.current) return;
          lastSerialized.current = next;

          // Strip volatile bits of appState so saving doesn't churn diffs.
          const {
            // Volatile UI state we don't want to persist:
            collaborators: _c,
            cursorButton: _cb,
            draggingElement: _de,
            editingElement: _ee,
            // The rest goes through.
            ...persistedAppState
          } = appState as Record<string, unknown>;
          void _c;
          void _cb;
          void _de;
          void _ee;

          setBoardSketch({
            elements,
            appState: persistedAppState,
            files,
          } as Record<string, unknown>);
        }}
      />
    </div>
  );
}
