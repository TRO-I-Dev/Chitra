import { app } from "electron";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

/**
 * Wires up `electron-updater` lifecycle events. In dev (`!app.isPackaged`)
 * we no-op because there's no `app-update.yml` — calling
 * `checkForUpdatesAndNotify` would crash the dev session.
 *
 * In production, the updater reads `publish` config from
 * `electron-builder.yml`. While `publish: null` (the current default),
 * the call is a quiet no-op too — wire publishing in the build config
 * to actually serve updates.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log("[updater] dev build — skipping auto-update check");
    return;
  }
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => console.log("[updater] checking…"));
  autoUpdater.on("update-available", (info) =>
    console.log(`[updater] update available: ${info.version}`),
  );
  autoUpdater.on("update-not-available", () => console.log("[updater] no update available"));
  autoUpdater.on("download-progress", (p) =>
    console.log(`[updater] downloading: ${Math.round(p.percent)}%`),
  );
  autoUpdater.on("update-downloaded", (info) =>
    console.log(`[updater] downloaded ${info.version} — will install on quit`),
  );
  autoUpdater.on("error", (err) => console.warn("[updater] error:", err));

  // Don't await — fire and forget on startup.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.warn("[updater] check failed:", err);
  });
}
