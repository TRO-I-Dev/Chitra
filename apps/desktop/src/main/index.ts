import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from "electron";

import { APP_INDEX, registerAppScheme, serveRenderer } from "./appProtocol.js";
import { buildAppMenu } from "./menu.js";
import { ensureCameraAccess, installPermissionPolicy } from "./permissions.js";
import { setupAutoUpdater } from "./updater.js";

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = join(__dirname_, "../renderer");

let mainWindow: BrowserWindow | null = null;

// Must run before `whenReady` — privileged schemes cannot be registered later.
registerAppScheme();

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0b10",
    titleBarStyle: "hiddenInset",
    title: "Chitra",
    webPreferences: {
      preload: join(__dirname_, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const emitMaxState = (): void => {
    mainWindow?.webContents.send("window:maximized", mainWindow?.isMaximized() ?? false);
  };
  mainWindow.on("maximize", emitMaxState);
  mainWindow.on("unmaximize", emitMaxState);

  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "question",
      buttons: ["Discard changes", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Unsaved changes",
      message: "You have unsaved changes. Close without saving?",
    });
    if (choice === 0) event.preventDefault();
  });

  // Never open a second Electron window for an external link.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Block in-place navigation away from our own origin — a stray link should
  // not be able to replace the app with a remote page that then inherits the
  // camera permission we granted.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env["ELECTRON_RENDERER_URL"];
    const allowed = url.startsWith(APP_INDEX) || (!!devUrl && url.startsWith(devUrl));
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadURL(APP_INDEX);
  }

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] render-process-gone", details);
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    console.error(`[renderer] preload-error ${preloadPath}`, err);
  });
}

function registerIpc(): void {
  ipcMain.handle("app:version", () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? "",
    node: process.versions.node,
  }));

  // Air Board asks for this before opening the camera so macOS can show its
  // system prompt from the main process, where it must originate.
  ipcMain.handle("airboard:ensureCamera", () => ensureCameraAccess(mainWindow));

  ipcMain.handle("win:minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("win:maxToggle", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("win:close", () => {
    mainWindow?.close();
  });
  ipcMain.handle("win:isMaximized", () => mainWindow?.isMaximized() ?? false);
}

// A second instance would fight over the same project files and camera.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    serveRenderer(RENDERER_DIR);
    installPermissionPolicy();
    registerIpc();
    Menu.setApplicationMenu(buildAppMenu(() => mainWindow));
    createMainWindow();
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
