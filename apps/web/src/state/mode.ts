import { create } from "zustand";

/**
 * `structure` — React Flow cards and edges (the default).
 * `sketch`    — Excalidraw captures the pointer for freehand drawing.
 * `air`       — Air Board: the webcam drives the cursor via hand tracking.
 */
export type WorkspaceMode = "structure" | "sketch" | "air";

interface ModeState {
  mode: WorkspaceMode;
  setMode: (m: WorkspaceMode) => void;
  /** Cycles structure ↔ sketch. Air is deliberate-entry only. */
  toggle: () => void;
}

export const useMode = create<ModeState>((set, get) => ({
  mode: "structure",
  setMode: (mode) => set({ mode }),
  toggle: () => set({ mode: get().mode === "structure" ? "sketch" : "structure" }),
}));
