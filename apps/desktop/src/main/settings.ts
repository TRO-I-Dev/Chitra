import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const Settings = z.object({
  notionParentPageId: z.string().optional(),
  confluenceBaseUrl: z.string().optional(),
  confluenceEmail: z.string().optional(),
  confluenceSpaceKey: z.string().optional(),
});
export type Settings = z.infer<typeof Settings>;

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return Settings.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function setSettings(patch: Settings): Promise<void> {
  const current = await getSettings();
  const next = Settings.parse({ ...current, ...patch });
  const p = settingsPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(next, null, 2), "utf8");
}
