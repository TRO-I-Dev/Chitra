import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  PROJECT_SCHEMA_VERSION,
  Project,
  ProjectManifest,
  type Project as TProject,
} from "@chitra/core";

/**
 * `.chitra` is a zip archive containing:
 *   manifest.json   — schema version, app version, timestamps
 *   project.json    — the full Project (cards + boards) until the canvas phase
 *                     introduces a Yjs binary (`doc.ydoc`)
 *   assets/         — embedded images / files (added in later phases)
 */

const MANIFEST_FILE = "manifest.json";
const PROJECT_FILE = "project.json";

export interface ProjectFile {
  project: TProject;
  manifest: ProjectManifest;
}

export async function readProjectFile(path: string): Promise<ProjectFile> {
  const buf = await fs.readFile(path);
  const entries = unzipSync(new Uint8Array(buf));

  const manifestRaw = entries[MANIFEST_FILE];
  const projectRaw = entries[PROJECT_FILE];
  if (!manifestRaw) throw new Error(`${path}: missing ${MANIFEST_FILE}`);
  if (!projectRaw) throw new Error(`${path}: missing ${PROJECT_FILE}`);

  const manifest = ProjectManifest.parse(JSON.parse(strFromU8(manifestRaw)));
  const project = Project.parse(JSON.parse(strFromU8(projectRaw)));

  if (manifest.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project file was created with a newer Chitra (schema v${manifest.schemaVersion}).`,
    );
  }
  return { project, manifest };
}

export async function writeProjectFile(
  path: string,
  project: TProject,
  appVersion: string,
): Promise<{ savedAt: string }> {
  const now = new Date().toISOString();
  const updated: TProject = { ...project, updatedAt: now };
  const manifest: ProjectManifest = {
    app: "chitra",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion,
    createdAt: project.createdAt,
    updatedAt: now,
    name: updated.name,
  };

  const zipped = zipSync(
    {
      [MANIFEST_FILE]: strToU8(JSON.stringify(manifest, null, 2)),
      [PROJECT_FILE]: strToU8(JSON.stringify(updated, null, 2)),
    },
    { level: 6 },
  );

  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, zipped);
  return { savedAt: now };
}
