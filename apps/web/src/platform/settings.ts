/**
 * Settings — small key/value record stored in IndexedDB.
 * Same shape as the old Electron `settings.json`.
 */
import { sharedDb } from "./handleStore.js";

const STORE = "kv";
const KEY = "settings";

export interface Settings {
  notionParentPageId?: string;
  confluenceBaseUrl?: string;
  confluenceEmail?: string;
  confluenceSpaceKey?: string;
}

export async function get(): Promise<Settings> {
  const d = await sharedDb.db();
  const v = (await d.get(STORE, KEY)) as Settings | undefined;
  return v ?? {};
}

export async function set(patch: Settings): Promise<{ ok: true }> {
  const d = await sharedDb.db();
  const prev = ((await d.get(STORE, KEY)) as Settings | undefined) ?? {};
  const merged: Settings = { ...prev };
  for (const [k, v] of Object.entries(patch) as Array<[keyof Settings, string | undefined]>) {
    if (v === undefined || v === "") delete merged[k];
    else merged[k] = v;
  }
  await d.put(STORE, merged, KEY);
  return { ok: true };
}
