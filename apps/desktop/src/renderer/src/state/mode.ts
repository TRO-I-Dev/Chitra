import { create } from "zustand";

export type WorkspaceMode = "structure" | "sketch";

interface ModeState {
  mode: WorkspaceMode;
  setMode: (m: WorkspaceMode) => void;
  toggle: () => void;
}

export const useMode = create<ModeState>((set, get) => ({
  mode: "structure",
  setMode: (mode) => set({ mode }),
  toggle: () => set({ mode: get().mode === "structure" ? "sketch" : "structure" }),
}));
