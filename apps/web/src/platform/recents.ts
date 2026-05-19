/**
 * Recently opened projects, persisted in IndexedDB.
 *
 * Each entry stores the file display name (or path), an opaque handle id
 * (or null for fallback browsers), and the last-opened timestamp. The
 * `RecentProject` zod schema requires `path` and `name`; we use the
 * filename as the path for fallback browsers.
 */
import type { RecentProject } from "@chitra/core";
import { sharedDb } from "./handleStore.js";

const STORE = "recents";
const MAX = 12;

interface RecentRecord {
  /** opaque key used as IDB primary key (== handle id, or path for fallback) */
  id: string;
  name: string;
  path: string;
  handleId: string | null;
  openedAt: number;
  /** When true, the entry is pinned to the top of the Welcome recents
   *  grid and is exempt from the MAX-entry trim. */
  pinned?: boolean;
}

function recordToRecent(rec: RecentRecord): RecentProject {
  return {
    name: rec.name,
    path: rec.path,
    lastOpenedAt: new Date(rec.openedAt).toISOString(),
  };
}

export async function list(): Promise<RecentProject[]> {
  const d = await sharedDb.db();
  const all = (await d.getAll(STORE)) as RecentRecord[];
  return all
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX)
    .map(recordToRecent);
}

export async function add(input: {
  name: string;
  path: string;
  handleId: string | null;
}): Promise<void> {
  const d = await sharedDb.db();
  const id = input.handleId ?? input.path;
  const existing = (await d.get(STORE, id)) as RecentRecord | undefined;
  const rec: RecentRecord = {
    id,
    name: input.name,
    path: input.path,
    handleId: input.handleId,
    openedAt: Date.now(),
    pinned: existing?.pinned ?? false,
  };
  await d.put(STORE, rec);
  // Trim to MAX, but never drop pinned entries.
  const all = (await d.getAll(STORE)) as RecentRecord[];
  const unpinned = all.filter((r) => !r.pinned);
  if (unpinned.length > MAX) {
    const sorted = unpinned.sort((a, b) => b.openedAt - a.openedAt);
    const drop = sorted.slice(MAX);
    const tx = d.transaction(STORE, "readwrite");
    await Promise.all(drop.map((r) => tx.store.delete(r.id)));
    await tx.done;
  }
}

export async function togglePin(id: string): Promise<void> {
  const d = await sharedDb.db();
  const rec = (await d.get(STORE, id)) as RecentRecord | undefined;
  if (!rec) return;
  rec.pinned = !rec.pinned;
  await d.put(STORE, rec);
}

export async function touch(handleId: string): Promise<void> {
  const d = await sharedDb.db();
  const rec = (await d.get(STORE, handleId)) as RecentRecord | undefined;
  if (!rec) return;
  rec.openedAt = Date.now();
  await d.put(STORE, rec);
}

export async function clear(): Promise<void> {
  const d = await sharedDb.db();
  await d.clear(STORE);
}

/** Internal: list raw records (used by the Welcome view to get handle ids). */
export async function listRaw(): Promise<
  Array<RecentProject & { handleId: string | null; pinned: boolean; id: string }>
> {
  const d = await sharedDb.db();
  const all = (await d.getAll(STORE)) as RecentRecord[];
  // Sort: pinned first (by openedAt), then unpinned (by openedAt).
  const sorted = all.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.openedAt - a.openedAt;
  });
  return sorted
    .slice(0, MAX + 6) // allow a few extra slots for pinned overflow
    .map((r) => ({
      ...recordToRecent(r),
      handleId: r.handleId,
      pinned: !!r.pinned,
      id: r.id,
    }));
}
