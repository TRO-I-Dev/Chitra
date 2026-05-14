import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { IpcChannel, IpcSchemas, type IpcChannel as Channel } from "@chitra/core/ipc";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 *  Window                                                             *
 * ------------------------------------------------------------------ */

let mainWindow: BrowserWindow | null = null;

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
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/* ------------------------------------------------------------------ *
 *  IPC — typed dispatcher                                             *
 * ------------------------------------------------------------------ */

type Handler<C extends Channel> = (
  args: import("@chitra/core/ipc").IpcRequest<C>,
) => Promise<import("@chitra/core/ipc").IpcResponse<C>> | import("@chitra/core/ipc").IpcResponse<C>;

function register<C extends Channel>(channel: C, handler: Handler<C>): void {
  const schema = IpcSchemas[channel];
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    // void requests come through as `undefined` — zod's `void()` accepts that.
    const parsed = schema.request.parse(raw);
    const result = await handler(parsed as never);
    return schema.response.parse(result);
  });
}

function registerAllHandlers(): void {
  register(IpcChannel.AppVersion, () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? "",
    node: process.versions.node,
  }));

  // Phase-1 handlers (project:new, project:open, project:save*, recents:*)
  // are stubbed to throw until the storage layer lands. The contract is in
  // place so the renderer can be wired against final types.
  const stub = (channel: string) => () => {
    throw new Error(`IPC '${channel}' is not implemented yet (Phase 1).`);
  };
  ipcMain.handle(IpcChannel.ProjectNew, stub(IpcChannel.ProjectNew));
  ipcMain.handle(IpcChannel.ProjectOpen, stub(IpcChannel.ProjectOpen));
  ipcMain.handle(IpcChannel.ProjectSave, stub(IpcChannel.ProjectSave));
  ipcMain.handle(IpcChannel.ProjectSaveAs, stub(IpcChannel.ProjectSaveAs));
  ipcMain.handle(IpcChannel.RecentsList, stub(IpcChannel.RecentsList));
  ipcMain.handle(IpcChannel.RecentsClear, stub(IpcChannel.RecentsClear));
}

/* ------------------------------------------------------------------ *
 *  Lifecycle                                                          *
 * ------------------------------------------------------------------ */

void app.whenReady().then(() => {
  registerAllHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
