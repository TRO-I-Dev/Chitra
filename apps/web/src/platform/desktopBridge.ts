/**
 * Electron bridge detection.
 *
 * The renderer is the same code in the browser and in the desktop shell. When
 * it happens to be running inside Electron, `window.chitra` exists and gives
 * us two things the browser can't offer: the native menubar, and the macOS
 * camera authorisation Air Board needs before `getUserMedia` will succeed.
 *
 * Everything here degrades to a no-op on the web.
 */

import { commandBus } from "./menu.js";

export interface ChitraDesktopApi {
  appVersion(): Promise<{ version: string; electron: string; node: string }>;
  ensureCameraAccess(): Promise<boolean>;
  onMenu(handler: (action: string) => void): () => void;
  win: {
    minimize(): Promise<void>;
    maxToggle(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(handler: (isMax: boolean) => void): () => void;
  };
}

declare global {
  interface Window {
    chitra?: Partial<ChitraDesktopApi>;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.chitra;
}

export function desktopApi(): Partial<ChitraDesktopApi> | null {
  return typeof window !== "undefined" ? (window.chitra ?? null) : null;
}

/**
 * Forward native menu clicks into the renderer's command bus, so a menubar
 * item and the command palette dispatch the identical action string.
 *
 * @returns an unsubscribe function (no-op on the web).
 */
export function connectDesktopMenu(): () => void {
  const api = desktopApi();
  if (!api?.onMenu) return () => undefined;
  return api.onMenu((action) => commandBus.dispatch(action));
}

/**
 * Ask the host OS for camera authorisation.
 *
 * On macOS the TCC prompt has to be raised from Electron's main process; a
 * bare `getUserMedia` there fails with an unrecoverable `NotAllowedError`.
 * On Windows, Linux and the web the browser's own prompt is enough, so this
 * resolves true and lets `getUserMedia` do the asking.
 */
export async function ensureCameraAccess(): Promise<boolean> {
  const api = desktopApi();
  if (!api?.ensureCameraAccess) return true;
  try {
    return await api.ensureCameraAccess();
  } catch {
    // A failed bridge call shouldn't block the browser path.
    return true;
  }
}
