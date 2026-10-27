import { contextBridge, ipcRenderer } from "electron";

/**
 * The `window.chitra` bridge.
 *
 * Kept deliberately small. Project files, settings and secrets all go through
 * the renderer's own platform adapter (File System Access API + IndexedDB),
 * which Chromium supports inside Electron — so the bridge only exposes what
 * genuinely requires the main process: window chrome, native menu events, and
 * the macOS camera authorisation Air Board needs.
 */
const api = {
  /** App / runtime versions, for the About dialog and diagnostics. */
  appVersion: (): Promise<{ version: string; electron: string; node: string }> =>
    ipcRenderer.invoke("app:version"),

  /**
   * Ask the OS for camera authorisation before Air Board calls
   * `getUserMedia`. Resolves true on platforms with no separate gate.
   */
  ensureCameraAccess: (): Promise<boolean> => ipcRenderer.invoke("airboard:ensureCamera"),

  /** Subscribe to native menu actions. Returns an unsubscribe function. */
  onMenu: (handler: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string): void => handler(action);
    ipcRenderer.on("menu", listener);
    return () => {
      ipcRenderer.removeListener("menu", listener);
    };
  },

  /** Window controls for the frameless title bar. */
  win: {
    minimize: (): Promise<void> => ipcRenderer.invoke("win:minimize"),
    maxToggle: (): Promise<boolean> => ipcRenderer.invoke("win:maxToggle"),
    close: (): Promise<void> => ipcRenderer.invoke("win:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("win:isMaximized"),
    onMaximizeChange: (handler: (isMax: boolean) => void): (() => void) => {
      const listener = (_e: unknown, isMax: boolean): void => handler(isMax);
      ipcRenderer.on("window:maximized", listener);
      return () => {
        ipcRenderer.removeListener("window:maximized", listener);
      };
    },
  },
} as const;

export type ChitraBridgeApi = typeof api;

contextBridge.exposeInMainWorld("chitra", api);
