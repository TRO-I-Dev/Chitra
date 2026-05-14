import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { RecentProject, type RecentProject as TRecent } from "@chitra/core";

/**
 * Lightweight JSON-file backed recents list. SQLite + full-text search lands
 * in a later phase — for v1 a flat list is plenty.
 */

const FILE_NAME = "recents.json";
const MAX_RECENTS = 12;

const RecentsFile = z.object({
  version: z.literal(1),
  items: z.array(RecentProject),
});

function recentsPath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

async function readAll(): Promise<TRecent[]> {
  try {
    const buf = await fs.readFile(recentsPath(), "utf8");
    const parsed = RecentsFile.safeParse(JSON.parse(buf));
    return parsed.success ? parsed.data.items : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(items: TRecent[]): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    recentsPath(),
    JSON.stringify({ version: 1, items } satisfies z.infer<typeof RecentsFile>, null, 2),
  );
}

export async function listRecents(): Promise<TRecent[]> {
  return readAll();
}

export async function pushRecent(item: TRecent): Promise<void> {
  const all = await readAll();
  const filtered = all.filter((r) => r.path !== item.path);
  filtered.unshift(item);
  await writeAll(filtered.slice(0, MAX_RECENTS));
}

export async function clearRecents(): Promise<void> {
  await writeAll([]);
}
