/**
 * Command bus — replaces the Electron native menu IPC.
 *
 * The AppBar menus, keyboard shortcut layer, and command palette all
 * dispatch typed action strings through this bus. Views subscribe via
 * `platform.onMenu(handler)`, exactly mirroring the old desktop API so
 * the consuming components are unchanged.
 */

type Handler = (action: string) => void;

class CommandBus {
  private listeners = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  dispatch(action: string): void {
    for (const fn of this.listeners) {
      try {
        fn(action);
      } catch (e) {
        // Don't let one bad handler break the bus.
        // eslint-disable-next-line no-console
        console.error("[command bus] handler threw:", e);
      }
    }
  }
}

export const commandBus = new CommandBus();

/** Canonical command catalogue — exported so the palette can list them. */
export interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  group: "File" | "Edit" | "View" | "Export" | "Help";
}

export const COMMANDS: CommandDef[] = [
  { id: "new-project", label: "New project", hint: "Ctrl+Shift+N", group: "File" },
  { id: "open-project", label: "Open project…", hint: "Ctrl+O", group: "File" },
  { id: "save", label: "Save", hint: "Ctrl+S", group: "File" },
  { id: "save-as", label: "Save as…", hint: "Ctrl+Shift+S", group: "File" },
  { id: "close-project", label: "Close project", group: "File" },
  { id: "new-card", label: "New card", hint: "Ctrl+N", group: "Edit" },
  { id: "undo", label: "Undo", hint: "Ctrl+Z", group: "Edit" },
  { id: "redo", label: "Redo", hint: "Ctrl+Y", group: "Edit" },
  { id: "open-templates", label: "Templates…", hint: "Ctrl+T", group: "View" },
  { id: "open-settings", label: "Settings…", hint: "Ctrl+,", group: "View" },
  { id: "toggle-theme", label: "Toggle theme", group: "View" },
  { id: "mode-structure", label: "Structure mode", hint: "Ctrl+1", group: "View" },
  { id: "mode-sketch", label: "Sketch mode", hint: "Ctrl+2", group: "View" },
  { id: "show-onboarding", label: "Show onboarding", group: "Help" },
  { id: "export-markdown", label: "Export as Markdown", group: "Export" },
  { id: "export-html", label: "Export interactive HTML", group: "Export" },
  { id: "export-png", label: "Export canvas PNG", group: "Export" },
  { id: "export-svg", label: "Export canvas SVG", group: "Export" },
  { id: "export-pdf", label: "Export PDF", group: "Export" },
  { id: "export-docx", label: "Export DOCX", group: "Export" },
  { id: "publish-notion", label: "Publish to Notion", group: "Export" },
  { id: "publish-confluence", label: "Publish to Confluence", group: "Export" },
];
