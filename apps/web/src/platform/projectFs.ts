/**
 * `.chitra` project file I/O against the browser File System Access API,
 * with a download/upload fallback for browsers without it (Firefox/Safari).
 *
 * A `.chitra` file is a zip archive (fflate) containing manifest.json and
 * project.json — exactly the same format as the desktop build wrote.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { nanoid } from "nanoid";
import {
  PROJECT_SCHEMA_VERSION,
  Project,
  ProjectManifest,
  type Project as TProject,
  type ProjectManifest as TProjectManifest,
} from "@chitra/core";
import { handleStore } from "./handleStore.js";

const MANIFEST_FILE = "manifest.json";
const PROJECT_FILE = "project.json";

/** Minimal ambient typing for the File System Access API. We only use a tiny
 *  surface and Vite's lib doesn't ship full types yet. */
declare global {
  interface Window {
    showOpenFilePicker?(opts?: unknown): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(opts?: unknown): Promise<FileSystemFileHandle>;
  }
}

export type ProjectHandleId = string;

export interface OpenedProject {
  handleId: ProjectHandleId | null;
  path: string;
  project: TProject;
}

export interface SavedProject {
  handleId: ProjectHandleId | null;
  path: string;
  savedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Feature detection                                                  */
/* ------------------------------------------------------------------ */

function hasFsAccess(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function nowIso(): string {
  return new Date().toISOString();
}

export function packProject(
  project: TProject,
  appVersion: string,
): { bytes: Uint8Array; manifest: TProjectManifest; updated: TProject } {
  const now = nowIso();
  const updated: TProject = { ...project, updatedAt: now };
  const manifest: TProjectManifest = {
    app: "chitra",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion,
    createdAt: project.createdAt,
    updatedAt: now,
    name: updated.name,
  };
  const bytes = zipSync(
    {
      [MANIFEST_FILE]: strToU8(JSON.stringify(manifest, null, 2)),
      [PROJECT_FILE]: strToU8(JSON.stringify(updated, null, 2)),
    },
    { level: 6 },
  );
  return { bytes, manifest, updated };
}

export function unpackProject(buf: ArrayBuffer | Uint8Array): {
  manifest: TProjectManifest;
  project: TProject;
} {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const entries = unzipSync(u8);
  const manifestRaw = entries[MANIFEST_FILE];
  const projectRaw = entries[PROJECT_FILE];
  if (!manifestRaw) throw new Error(`Missing ${MANIFEST_FILE} in .chitra archive`);
  if (!projectRaw) throw new Error(`Missing ${PROJECT_FILE} in .chitra archive`);
  const manifest = ProjectManifest.parse(JSON.parse(strFromU8(manifestRaw)));
  const project = Project.parse(JSON.parse(strFromU8(projectRaw)));
  if (manifest.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `This project was created with a newer Chitra (schema v${manifest.schemaVersion}).`,
    );
  }
  return { manifest, project };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function projectNew({ name }: { name: string }): Promise<TProject> {
  const ts = nowIso();
  return Project.parse({
    id: nanoid(),
    name: name.trim() || "Untitled project",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    cards: [],
    boards: [{ id: nanoid(), name: "Main board", nodes: [], edges: [] }],
    createdAt: ts,
    updatedAt: ts,
  });
}

export async function projectOpen(): Promise<OpenedProject | null> {
  if (hasFsAccess() && window.showOpenFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      const [picked] = await window.showOpenFilePicker({
        types: [
          {
            description: "Chitra project",
            accept: { "application/zip": [".chitra"] },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: false,
      });
      if (!picked) return null;
      handle = picked;
    } catch (err) {
      // User cancelled
      if ((err as DOMException)?.name === "AbortError") return null;
      throw err;
    }
    const file = await handle.getFile();
    const { project } = unpackProject(await file.arrayBuffer());
    const handleId = await handleStore.put(handle);
    return { handleId, path: handle.name, project };
  }

  // Fallback: <input type=file>
  const file = await pickFileViaInput();
  if (!file) return null;
  const { project } = unpackProject(await file.arrayBuffer());
  return { handleId: null, path: file.name, project };
}

export async function projectOpenByHandle(
  handleId: ProjectHandleId,
): Promise<OpenedProject | null> {
  const handle = await handleStore.get(handleId);
  if (!handle) return null;
  const granted = await ensurePermission(handle, "read");
  if (!granted) return null;
  try {
    const file = await handle.getFile();
    const { project } = unpackProject(await file.arrayBuffer());
    return { handleId, path: handle.name, project };
  } catch (err) {
    // File may have moved/been deleted
    if ((err as DOMException)?.name === "NotFoundError") {
      await handleStore.remove(handleId);
      return null;
    }
    throw err;
  }
}

export async function projectSaveExisting(
  handleId: ProjectHandleId,
  project: TProject,
  appVersion: string,
): Promise<SavedProject> {
  const handle = await handleStore.get(handleId);
  if (!handle) {
    // Handle was lost — fall back to Save As.
    return projectSaveAs(project, appVersion);
  }
  const granted = await ensurePermission(handle, "readwrite");
  if (!granted) throw new Error("Permission to write the project file was denied.");
  const { bytes, updated } = packProject(project, appVersion);
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return { handleId, path: handle.name, savedAt: updated.updatedAt };
}

export async function projectSaveAs(
  project: TProject,
  appVersion: string,
): Promise<SavedProject> {
  const { bytes, updated } = packProject(project, appVersion);
  const suggested = `${sanitizeName(project.name)}.chitra`;

  if (hasFsAccess() && window.showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [
          {
            description: "Chitra project",
            accept: { "application/zip": [".chitra"] },
          },
        ],
      });
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        return { handleId: null, path: suggested, savedAt: updated.updatedAt };
      }
      throw err;
    }
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    const handleId = await handleStore.put(handle);
    return { handleId, path: handle.name, savedAt: updated.updatedAt };
  }

  // Fallback: trigger an anchor download.
  triggerDownload(suggested, new Blob([bytes], { type: "application/zip" }));
  return { handleId: null, path: suggested, savedAt: updated.updatedAt };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function sanitizeName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "chitra-project";
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".chitra,application/zip";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Some browsers require the input to be in the DOM.
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  });
}

function triggerDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

async function ensurePermission(
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  // Permission API only on browsers that ship FS Access.
  type WithPerms = FileSystemFileHandle & {
    queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  };
  const h = handle as WithPerms;
  if (!h.queryPermission || !h.requestPermission) return true;
  const cur = await h.queryPermission({ mode });
  if (cur === "granted") return true;
  const next = await h.requestPermission({ mode });
  return next === "granted";
}
