import { create } from "zustand";

export type ThemeMode = "studio" | "calm";

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const KEY = "chitra:theme";

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "calm" ? "calm" : "studio";
  } catch {
    return "studio";
  }
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: load(),
  setMode: (m) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset["theme"] = m;
    set({ mode: m });
  },
  toggle: () => {
    const next: ThemeMode = get().mode === "studio" ? "calm" : "studio";
    get().setMode(next);
  },
}));

/** Call once on app boot to apply the persisted theme to <html>. */
export function bootstrapTheme(): void {
  document.documentElement.dataset["theme"] = useTheme.getState().mode;
}
