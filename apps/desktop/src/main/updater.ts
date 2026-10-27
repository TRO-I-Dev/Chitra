import { createRequire } from "node:module";
import { app } from "electron";

/**
 * Background auto-update. No-ops in dev, where there is no published feed.
 *
 * `electron-updater` is CommonJS. Electron's ESM loader chokes preparsing it
 * from a static `import` in an ESM main process, so it is pulled in through
 * `createRequire` instead — and lazily, inside the packaged branch, so a dev
 * run never loads it at all.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log("[updater] dev build — skipping auto-update check");
    return;
  }

  let autoUpdater: import("electron-updater").AppUpdater;
  try {
    const require = createRequire(import.meta.url);
    autoUpdater = (require("electron-updater") as typeof import("electron-updater")).autoUpdater;
  } catch (err) {
    console.warn("[updater] electron-updater unavailable:", err);
    return;
  }

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => console.log("[updater] checking…"));
  autoUpdater.on("update-available", (info) => console.log(`[updater] available: ${info.version}`));
  autoUpdater.on("update-not-available", () => console.log("[updater] up to date"));
  autoUpdater.on("download-progress", (p) => console.log(`[updater] ${Math.round(p.percent)}%`));
  autoUpdater.on("update-downloaded", (info) =>
    console.log(`[updater] downloaded ${info.version} — installs on quit`),
  );
  autoUpdater.on("error", (err) => console.warn("[updater] error:", err));
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.warn("[updater] check failed:", err);
  });
}
