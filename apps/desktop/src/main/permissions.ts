import { type BrowserWindow, dialog, session, shell, systemPreferences } from "electron";
import { APP_ORIGIN } from "./appProtocol.js";

/**
 * Web-API permission policy.
 *
 * Electron's default is to grant most permissions to any page without asking,
 * which is exactly backwards for an app that now opens a camera. This locks
 * the policy down to a deny-by-default allowlist: only our own origin, and
 * only the permissions Chitra actually uses.
 *
 * `media` is what `getUserMedia({ video: true })` requests — Air Board's
 * camera feed. Everything else (geolocation, notifications, MIDI, HID, …) is
 * refused outright.
 */
const ALLOWED = new Set(["media"]);

/** Origins allowed to hold permissions. Dev also serves over http://127.0.0.1. */
function isTrustedOrigin(url: string): boolean {
  if (!url) return false;
  if (url.startsWith(APP_ORIGIN)) return true;
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  return !!devUrl && url.startsWith(devUrl);
}

export function installPermissionPolicy(): void {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = details?.requestingUrl || webContents?.getURL() || "";
    const granted = ALLOWED.has(permission) && isTrustedOrigin(url);
    if (!granted) {
      console.warn(`[permissions] denied "${permission}" for ${url || "unknown origin"}`);
    }
    callback(granted);
  });

  // Synchronous checks (e.g. `navigator.permissions.query`) go through a
  // separate handler; without it the renderer can report "granted" for things
  // the request handler would refuse.
  ses.setPermissionCheckHandler(
    (_wc, permission, requestingOrigin) =>
      ALLOWED.has(permission) && isTrustedOrigin(requestingOrigin),
  );

  // Air Board never captures the screen, only the camera. Refuse display
  // capture explicitly rather than relying on the default picker.
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}), {
    useSystemPicker: false,
  });
}

/**
 * macOS gates camera access behind a system-level TCC prompt that must be
 * triggered from the main process; without it `getUserMedia` fails with an
 * opaque NotAllowedError no in-app retry can fix.
 *
 * @returns true if the app may use the camera.
 */
export async function ensureCameraAccess(window: BrowserWindow | null): Promise<boolean> {
  if (process.platform !== "darwin") return true;

  const status = systemPreferences.getMediaAccessStatus("camera");
  if (status === "granted") return true;
  if (status === "not-determined") {
    return systemPreferences.askForMediaAccess("camera");
  }

  // Denied or restricted — only System Settings can undo it, so say so and
  // offer to open the right pane instead of failing silently.
  const { response } = await dialog.showMessageBox(window ?? undefined!, {
    type: "warning",
    title: "Camera access is blocked",
    message: "Air Board needs the camera",
    detail:
      "macOS is blocking camera access for Chitra. Enable it under Privacy & Security → Camera, then reopen Air Board.",
    buttons: ["Open System Settings", "Not now"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    );
  }
  return false;
}
