/**
 * Global keyboard shortcut layer. Workspace owns its in-context shortcuts
 * (save, undo, mode switching). This hook covers app-level commands that
 * should fire from anywhere — primarily the command palette.
 */
import { useEffect } from "react";
import { platform } from "../platform/index.js";

export interface HotkeyHandlers {
  onPalette: () => void;
}

export function useGlobalHotkeys(h: HotkeyHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const cmd = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      // Cmd/Ctrl+K → command palette (always)
      if (cmd && k === "k") {
        e.preventDefault();
        h.onPalette();
        return;
      }

      // Skip the rest when an input owns focus.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }

      // Cmd/Ctrl+, → settings
      if (cmd && k === ",") {
        e.preventDefault();
        platform.dispatchCommand("open-settings");
        return;
      }
      // Cmd/Ctrl+T → templates
      if (cmd && k === "t") {
        e.preventDefault();
        platform.dispatchCommand("open-templates");
        return;
      }
      // Cmd/Ctrl+O → open project
      if (cmd && k === "o") {
        e.preventDefault();
        platform.dispatchCommand("open-project");
        return;
      }
      // Cmd/Ctrl+Shift+N → new project
      if (cmd && e.shiftKey && k === "n") {
        e.preventDefault();
        platform.dispatchCommand("new-project");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
