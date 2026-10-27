import {
  type BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  app,
  dialog,
  shell,
} from "electron";

/**
 * Native application menu.
 *
 * Every item dispatches a command string over the `menu` IPC channel; the
 * renderer feeds those into the same command bus the palette and keyboard
 * shortcuts use, so a menu item and `Ctrl+K → command` run identical code.
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === "darwin";
  const send = (action: string): void => {
    getWindow()?.webContents.send("menu", action);
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "&File",
    submenu: [
      { label: "New project", accelerator: "CmdOrCtrl+Shift+N", click: () => send("new-project") },
      { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => send("open-project") },
      { type: "separator" },
      { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("save") },
      { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-as") },
      { type: "separator" },
      {
        label: "Export",
        submenu: [
          { label: "Markdown", click: () => send("export-markdown") },
          { label: "Interactive HTML", click: () => send("export-html") },
          { label: "Embed snippet", click: () => send("export-embed") },
          { type: "separator" },
          { label: "Canvas PNG", click: () => send("export-png") },
          { label: "Canvas SVG", click: () => send("export-svg") },
          { label: "PDF", click: () => send("export-pdf") },
          { label: "DOCX", click: () => send("export-docx") },
          { type: "separator" },
          { label: "Publish to Notion", click: () => send("publish-notion") },
          { label: "Publish to Confluence", click: () => send("publish-confluence") },
        ],
      },
      { type: "separator" },
      { label: "Close project", accelerator: "CmdOrCtrl+W", click: () => send("close-project") },
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
      { label: "New card…", accelerator: "CmdOrCtrl+N", click: () => send("new-card") },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "&View",
    submenu: [
      { label: "Structure mode", accelerator: "CmdOrCtrl+1", click: () => send("mode-structure") },
      { label: "Sketch mode", accelerator: "CmdOrCtrl+2", click: () => send("mode-sketch") },
      { label: "Air Board", accelerator: "CmdOrCtrl+3", click: () => send("mode-air") },
      { type: "separator" },
      { label: "Templates…", accelerator: "CmdOrCtrl+T", click: () => send("open-templates") },
      { label: "Decision log", click: () => send("open-decision-log") },
      { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => send("open-settings") },
      { label: "Toggle theme", accelerator: "CmdOrCtrl+J", click: () => send("toggle-theme") },
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

  const airMenu: MenuItemConstructorOptions = {
    label: "&Air Board",
    submenu: [
      { label: "Open Air Board", accelerator: "CmdOrCtrl+3", click: () => send("mode-air") },
      { type: "separator" },
      { label: "Field guide — how to use Air Board", click: () => send("airboard-tutorial") },
      { label: "Calibrate my gestures…", click: () => send("airboard-calibrate") },
      { label: "Air Board settings…", click: () => send("airboard-settings") },
      { type: "separator" },
      {
        label: "About camera privacy",
        click: () => {
          const w = getWindow();
          void dialog.showMessageBox(w ?? undefined!, {
            type: "info",
            title: "Air Board & your camera",
            message: "Video never leaves this machine",
            detail:
              "Air Board runs hand tracking locally with MediaPipe. Frames are analysed in memory " +
              "and discarded — nothing is recorded, stored, or sent anywhere. The camera only runs " +
              "while Air Board mode is open, and the indicator light turns off the moment you leave it.",
            buttons: ["OK"],
          });
        },
      },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "&Help",
    submenu: [
      { label: "Show welcome tour", click: () => send("show-onboarding") },
      { label: "Documentation", click: () => void shell.openExternal("https://github.com") },
      { type: "separator" },
      {
        label: "About Chitra",
        click: () => {
          const w = getWindow();
          void dialog.showMessageBox(w ?? undefined!, {
            type: "info",
            title: "About Chitra",
            message: "Chitra Studio",
            detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}\nNode ${process.versions.node}\n\nTurn writing into a beautiful plan.`,
            buttons: ["OK"],
          });
        },
      },
    ],
  };

  return Menu.buildFromTemplate([fileMenu, editMenu, viewMenu, airMenu, helpMenu]);
}
