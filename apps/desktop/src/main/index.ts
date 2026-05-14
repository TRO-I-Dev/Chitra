import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { nanoid } from "nanoid";
import {
  IpcChannel,
  IpcSchemas,
  PROJECT_FILE_EXT,
  PROJECT_SCHEMA_VERSION,
  type IpcChannel as Channel,
  type IpcRequest,
  type IpcResponse,
  type Project as TProject,
} from "@chitra/core";
import { readProjectFile, writeProjectFile } from "./projectFile.js";
import { clearRecents, listRecents, pushRecent } from "./recents.js";

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
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

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
  args: IpcRequest<C>,
) => Promise<IpcResponse<C>> | IpcResponse<C>;

function register<C extends Channel>(channel: C, handler: Handler<C>): void {
  const schema = IpcSchemas[channel];
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const parsed = schema.request.parse(raw);
    const result = await handler(parsed as never);
    return schema.response.parse(result);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function newProject(name: string): TProject {
  const ts = nowIso();
  return {
    id: nanoid(),
    name,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    cards: [],
    boards: [{ id: nanoid(), name: "Main board", nodes: [], edges: [] }],
  };
}

async function pickOpenPath(): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Chitra project",
    filters: [{ name: "Chitra project", extensions: ["chitra"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
}

async function pickSavePath(suggestedName: string): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Chitra project",
    defaultPath: `${suggestedName}${PROJECT_FILE_EXT}`,
    filters: [{ name: "Chitra project", extensions: ["chitra"] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

function registerAllHandlers(): void {
  register(IpcChannel.AppVersion, () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? "",
    node: process.versions.node,
  }));

  register(IpcChannel.ProjectNew, ({ name }) => newProject(name));

  register(IpcChannel.ProjectOpen, async ({ path }) => {
    const target = path ?? (await pickOpenPath());
    if (!target) return null;
    const { project } = await readProjectFile(target);
    await pushRecent({ path: target, name: project.name, lastOpenedAt: nowIso() });
    return { path: target, project };
  });

  register(IpcChannel.ProjectSave, async ({ path, project }) => {
    const { savedAt } = await writeProjectFile(path, project, app.getVersion());
    await pushRecent({ path, name: project.name, lastOpenedAt: savedAt });
    return { path, savedAt };
  });

  register(IpcChannel.ProjectSaveAs, async ({ project }) => {
    const target = await pickSavePath(project.name || "Untitled");
    if (!target) return null;
    const { savedAt } = await writeProjectFile(target, project, app.getVersion());
    const name = basename(target, PROJECT_FILE_EXT);
    await pushRecent({ path: target, name: project.name || name, lastOpenedAt: savedAt });
    return { path: target, savedAt };
  });

  register(IpcChannel.RecentsList, () => listRecents());

  register(IpcChannel.RecentsClear, async () => {
    await clearRecents();
    return { ok: true as const };
  });
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
