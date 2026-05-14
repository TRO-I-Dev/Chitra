import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { writeFile } from "node:fs/promises";
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
import { getSettings, setSettings } from "./settings.js";
import { deleteSecret, getSecret, setSecret } from "./secrets.js";
import { publishToNotion } from "./publishers/notion.js";
import { publishToConfluence } from "./publishers/confluence.js";
import { setupAutoUpdater } from "./updater.js";
import { buildAppMenu } from "./appMenu.js";

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

  // Generic file save: renderer hands us bytes + suggested filename, we
  // prompt the OS save dialog and write to disk.
  register(IpcChannel.FileSave, async ({ suggestedName, filters, payload }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export",
      defaultPath: suggestedName,
      filters,
    });
    if (result.canceled || !result.filePath) return null;
    if (payload.kind === "text") {
      await writeFile(result.filePath, payload.text, "utf8");
    } else {
      await writeFile(result.filePath, Buffer.from(payload.base64, "base64"));
    }
    return { path: result.filePath };
  });

  // PDF export: spin up an offscreen window, load the supplied HTML, run
  // printToPDF, then prompt the OS save dialog.
  register(IpcChannel.ExportPdf, async ({ suggestedName, html, landscape }) => {
    if (!mainWindow) return null;
    const offscreen = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, offscreen: false },
    });
    try {
      await offscreen.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await offscreen.webContents.printToPDF({
        printBackground: true,
        landscape,
        pageSize: "A4",
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Export PDF",
        defaultPath: suggestedName.endsWith(".pdf") ? suggestedName : `${suggestedName}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, pdfBuffer);
      return { path: result.filePath };
    } finally {
      offscreen.destroy();
    }
  });

  // Settings (non-secret JSON in userData)
  register(IpcChannel.SettingsGet, () => getSettings());
  register(IpcChannel.SettingsSet, async (patch) => {
    await setSettings(patch);
    return { ok: true as const };
  });

  // Secrets (keytar with in-memory fallback)
  register(IpcChannel.SecretGet, async ({ key }) => ({ value: await getSecret(key) }));
  register(IpcChannel.SecretSet, async ({ key, value }) => {
    await setSecret(key, value);
    return { ok: true as const };
  });
  register(IpcChannel.SecretDelete, async ({ key }) => {
    await deleteSecret(key);
    return { ok: true as const };
  });

  // Publish — Notion
  register(IpcChannel.PublishNotion, async ({ project, boardId }) => {
    const [token, settings] = await Promise.all([getSecret("notion-token"), getSettings()]);
    if (!token) throw new Error("Set your Notion integration token in Settings first.");
    if (!settings.notionParentPageId)
      throw new Error("Set the Notion parent page id in Settings first.");
    return publishToNotion({
      token,
      parentPageId: settings.notionParentPageId,
      project,
      ...(boardId !== undefined ? { boardId } : {}),
    });
  });

  // Publish — Confluence
  register(IpcChannel.PublishConfluence, async ({ project, boardId }) => {
    const [token, settings] = await Promise.all([
      getSecret("confluence-token"),
      getSettings(),
    ]);
    if (!token) throw new Error("Set your Confluence API token in Settings first.");
    if (!settings.confluenceBaseUrl || !settings.confluenceEmail || !settings.confluenceSpaceKey)
      throw new Error("Set your Confluence base URL, email and space key in Settings first.");
    return publishToConfluence({
      baseUrl: settings.confluenceBaseUrl,
      email: settings.confluenceEmail,
      token,
      spaceKey: settings.confluenceSpaceKey,
      project,
      ...(boardId !== undefined ? { boardId } : {}),
    });
  });
}

/* ------------------------------------------------------------------ *
 *  Lifecycle                                                          *
 * ------------------------------------------------------------------ */

void app.whenReady().then(() => {
  registerAllHandlers();
  Menu.setApplicationMenu(buildAppMenu(() => mainWindow));
  createMainWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
