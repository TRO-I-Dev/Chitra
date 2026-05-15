/**
 * Platform adapter — every browser-side capability that used to come
 * from `window.chitra` (the Electron preload bridge) lives here.
 *
 * The shape mirrors the old IPC surface so the rest of the renderer
 * can keep its call-sites almost identical.
 */
import type { Project, RecentProject } from "@chitra/core";

import * as projectFs from "./projectFs.js";
import * as recents from "./recents.js";
import * as settings from "./settings.js";
import * as secrets from "./secrets.js";
import * as fileSave from "./fileSave.js";
import * as exportPdfMod from "./exportPdf.js";
import { publishNotion as doPublishNotion } from "./publish/notion.js";
import { publishConfluence as doPublishConfluence } from "./publish/confluence.js";
import { commandBus } from "./menu.js";

declare const __APP_VERSION__: string;

export type ProjectHandleId = projectFs.ProjectHandleId;

export interface OpenedProject {
  /** Opaque id for the underlying file handle (or null if unavailable). */
  handleId: ProjectHandleId | null;
  /** Human-readable name (filename or "Untitled.chitra"). */
  path: string;
  project: Project;
}

export interface SavedProject {
  handleId: ProjectHandleId | null;
  path: string;
  savedAt: string;
}

export const platform = {
  version(): { version: string; runtime: "web" } {
    return { version: __APP_VERSION__, runtime: "web" };
  },

  /* ---------- Project files ---------- */
  projectNew: projectFs.projectNew,
  /** Open a `.chitra` file via the file picker. */
  async projectOpen(): Promise<OpenedProject | null> {
    const opened = await projectFs.projectOpen();
    if (opened) await recents.add({ name: opened.project.name, path: opened.path, handleId: opened.handleId });
    return opened;
  },
  /** Open a recent project by handle id. Returns null if permission denied. */
  async projectOpenRecent(handleId: ProjectHandleId): Promise<OpenedProject | null> {
    const opened = await projectFs.projectOpenByHandle(handleId);
    if (opened) await recents.touch(handleId);
    return opened;
  },
  /** Save to existing handle (no picker). Falls back to Save As if no handle. */
  async projectSave(handleId: ProjectHandleId | null, project: Project): Promise<SavedProject> {
    if (!handleId) return platform.projectSaveAs(project);
    const saved = await projectFs.projectSaveExisting(handleId, project, __APP_VERSION__);
    await recents.add({ name: project.name, path: saved.path, handleId: saved.handleId });
    return saved;
  },
  /** Open save picker / fallback download. */
  async projectSaveAs(project: Project): Promise<SavedProject> {
    const saved = await projectFs.projectSaveAs(project, __APP_VERSION__);
    if (saved.handleId) {
      await recents.add({ name: project.name, path: saved.path, handleId: saved.handleId });
    }
    return saved;
  },

  /* ---------- Recents ---------- */
  recentsList(): Promise<RecentProject[]> {
    return recents.list();
  },
  recentsClear(): Promise<void> {
    return recents.clear();
  },

  /* ---------- Generic file save (exports) ---------- */
  fileSave: fileSave.fileSave,

  /* ---------- PDF (browser print) ---------- */
  exportPdf: exportPdfMod.exportPdf,

  /* ---------- Settings ---------- */
  settingsGet: settings.get,
  settingsSet: settings.set,

  /* ---------- Secrets ---------- */
  secretGet: secrets.get,
  secretSet: secrets.set,
  secretDelete: secrets.del,

  /* ---------- Publishers ---------- */
  async publishNotion(project: Project): Promise<{ url: string } | null> {
    const s = await settings.get();
    const tok = await secrets.get({ key: "notion-token" });
    if (!tok.value || !s.notionParentPageId) {
      throw new Error("Notion is not configured. Open Settings to add the token and parent page id.");
    }
    return doPublishNotion({
      token: tok.value,
      parentPageId: s.notionParentPageId,
      project,
    });
  },
  async publishConfluence(project: Project): Promise<{ url: string } | null> {
    const s = await settings.get();
    const tok = await secrets.get({ key: "confluence-token" });
    if (!tok.value || !s.confluenceBaseUrl || !s.confluenceEmail || !s.confluenceSpaceKey) {
      throw new Error("Confluence is not configured. Open Settings to add token, URL, email and space key.");
    }
    return doPublishConfluence({
      baseUrl: s.confluenceBaseUrl,
      email: s.confluenceEmail,
      spaceKey: s.confluenceSpaceKey,
      token: tok.value,
      project,
    });
  },

  /* ---------- Command bus (replaces native menu IPC) ---------- */
  /**
   * Subscribe to commands dispatched by the AppBar / hotkeys / palette.
   * Mirrors the old `onMenu(action)` signature.
   */
  onMenu(handler: (action: string) => void): () => void {
    return commandBus.subscribe(handler);
  },
  /** Dispatch a command (used by AppBar, palette, keyboard shortcuts). */
  dispatchCommand(action: string): void {
    commandBus.dispatch(action);
  },
} as const;

export type Platform = typeof platform;
