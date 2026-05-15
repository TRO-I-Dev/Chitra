/**
 * Persists `FileSystemFileHandle` objects in IndexedDB keyed by an opaque
 * id. Handles are structured-clonable into IDB; this lets us remember
 * recently opened projects across reloads.
 */
import { openDB, type IDBPDatabase } from "idb";
import { nanoid } from "nanoid";

const DB_NAME = "chitra";
const DB_VERSION = 1;
const HANDLES_STORE = "handles";

interface HandleRecord {
  id: string;
  handle: FileSystemFileHandle;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(HANDLES_STORE)) {
          d.createObjectStore(HANDLES_STORE, { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("kv")) {
          d.createObjectStore("kv");
        }
        if (!d.objectStoreNames.contains("recents")) {
          d.createObjectStore("recents", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export const handleStore = {
  async put(handle: FileSystemFileHandle): Promise<string> {
    const id = nanoid();
    const d = await db();
    const rec: HandleRecord = { id, handle, createdAt: Date.now() };
    await d.put(HANDLES_STORE, rec);
    return id;
  },
  async get(id: string): Promise<FileSystemFileHandle | null> {
    const d = await db();
    const rec = (await d.get(HANDLES_STORE, id)) as HandleRecord | undefined;
    return rec?.handle ?? null;
  },
  async remove(id: string): Promise<void> {
    const d = await db();
    await d.delete(HANDLES_STORE, id);
  },
};

/** Shared accessor for other modules that want a kv/recents store. */
export const sharedDb = { db };
