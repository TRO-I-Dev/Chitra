import { app, Menu, dialog, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";

/**
 * Renderer-handled menu actions. The main process emits these via
 * `webContents.send("menu", action)` and the renderer listens through the
 * preload bridge.
 */
export type MenuAction =
  | "new-project"
  | "open-project"
  | "save"
  | "save-as"
  | "close-project"
  | "new-card"
  | "undo"
  | "redo"
  | "open-templates"
  | "open-settings"
  | "toggle-theme"
  | "show-onboarding"
  | "mode-structure"
  | "mode-sketch";

export function buildAppMenu(getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === "darwin";

  const send = (action: MenuAction): void => {
    getWindow()?.webContents.send("menu", action);
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "&File",
    submenu: [
      { label: "New project", accelerator: "CmdOrCtrl+Shift+N", click: () => send("new-project") },
      { label: "Open\u2026",   accelerator: "CmdOrCtrl+O",       click: () => send("open-project") },
      { type: "separator" },
      { label: "Save",         accelerator: "CmdOrCtrl+S",       click: () => send("save") },
      { label: "Save As\u2026", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-as") },
      { type: "separator" },
      { label: "Close project", accelerator: "CmdOrCtrl+W",      click: () => send("close-project") },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "&Edit",
    submenu: [
      { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
      { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: () => send("redo") },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
      { type: "separator" },
      { label: "New card\u2026", accelerator: "CmdOrCtrl+N", click: () => send("new-card") },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "&View",
    submenu: [
      { label: "Structure mode", accelerator: "CmdOrCtrl+1", click: () => send("mode-structure") },
      { label: "Sketch mode",    accelerator: "CmdOrCtrl+2", click: () => send("mode-sketch") },
      { type: "separator" },
      { label: "Templates\u2026", accelerator: "CmdOrCtrl+T", click: () => send("open-templates") },
      { label: "Settings\u2026", accelerator: "CmdOrCtrl+,",  click: () => send("open-settings") },
      { label: "Toggle theme",   accelerator: "CmdOrCtrl+J",  click: () => send("toggle-theme") },
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "&Help",
    submenu: [
      {
        label: "Show welcome tour",
        click: () => send("show-onboarding"),
      },
      {
        label: "Documentation",
        click: () => void shell.openExternal("https://github.com"),
      },
      { type: "separator" },
      {
        label: "About Chitra",
        click: () => {
          const w = getWindow();
          void dialog.showMessageBox(w ?? undefined as unknown as BrowserWindow, {
            type: "info",
            title: "About Chitra",
            message: "Chitra Studio",
            detail:
              `Version ${app.getVersion()}\n` +
              `Electron ${process.versions.electron}\n` +
              `Node ${process.versions.node}\n\n` +
              "Turn writing into a beautiful plan.",
            buttons: ["OK"],
          });
        },
      },
    ],
  };

  return Menu.buildFromTemplate([fileMenu, editMenu, viewMenu, helpMenu]);
}
