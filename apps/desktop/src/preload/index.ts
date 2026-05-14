import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel, IpcSchemas, type IpcRequest, type IpcResponse } from "@chitra/core/ipc";

/**
 * Renderer-facing API. The renderer never touches `ipcRenderer` directly —
 * everything goes through this typed bridge, which validates BOTH the
 * outgoing args and the incoming response with the same zod schemas the
 * main process uses.
 */
async function invoke<C extends keyof typeof IpcSchemas>(
  channel: C,
  args: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  const schema = IpcSchemas[channel];
  const safeArgs = schema.request.parse(args);
  const result = (await ipcRenderer.invoke(channel, safeArgs)) as unknown;
  return schema.response.parse(result) as IpcResponse<C>;
}

const api = {
  appVersion: () => invoke(IpcChannel.AppVersion, undefined as never),
  projectNew: (args: IpcRequest<typeof IpcChannel.ProjectNew>) => invoke(IpcChannel.ProjectNew, args),
  projectOpen: (args: IpcRequest<typeof IpcChannel.ProjectOpen>) =>
    invoke(IpcChannel.ProjectOpen, args),
  projectSave: (args: IpcRequest<typeof IpcChannel.ProjectSave>) =>
    invoke(IpcChannel.ProjectSave, args),
  projectSaveAs: (args: IpcRequest<typeof IpcChannel.ProjectSaveAs>) =>
    invoke(IpcChannel.ProjectSaveAs, args),
  recentsList: () => invoke(IpcChannel.RecentsList, undefined as never),
  recentsClear: () => invoke(IpcChannel.RecentsClear, undefined as never),
  fileSave: (args: IpcRequest<typeof IpcChannel.FileSave>) => invoke(IpcChannel.FileSave, args),
  exportPdf: (args: IpcRequest<typeof IpcChannel.ExportPdf>) => invoke(IpcChannel.ExportPdf, args),
  settingsGet: () => invoke(IpcChannel.SettingsGet, undefined as never),
  settingsSet: (args: IpcRequest<typeof IpcChannel.SettingsSet>) =>
    invoke(IpcChannel.SettingsSet, args),
  secretGet: (args: IpcRequest<typeof IpcChannel.SecretGet>) => invoke(IpcChannel.SecretGet, args),
  secretSet: (args: IpcRequest<typeof IpcChannel.SecretSet>) => invoke(IpcChannel.SecretSet, args),
  secretDelete: (args: IpcRequest<typeof IpcChannel.SecretDelete>) =>
    invoke(IpcChannel.SecretDelete, args),
  publishNotion: (args: IpcRequest<typeof IpcChannel.PublishNotion>) =>
    invoke(IpcChannel.PublishNotion, args),
  publishConfluence: (args: IpcRequest<typeof IpcChannel.PublishConfluence>) =>
    invoke(IpcChannel.PublishConfluence, args),
  /** Subscribe to native menu events sent from the main process. */
  onMenu: (handler: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string): void => handler(action);
    ipcRenderer.on("menu", listener);
    return () => {
      ipcRenderer.removeListener("menu", listener);
    };
  },
  /** Window control bridge for the custom (frameless) title bar. */
  win: {
    minimize:    (): Promise<void>    => ipcRenderer.invoke("win:minimize") as Promise<void>,
    maxToggle:   (): Promise<boolean> => ipcRenderer.invoke("win:maxToggle") as Promise<boolean>,
    close:       (): Promise<void>    => ipcRenderer.invoke("win:close") as Promise<void>,
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("win:isMaximized") as Promise<boolean>,
    onMaximizeChange: (handler: (isMax: boolean) => void): (() => void) => {
      const listener = (_e: unknown, isMax: boolean): void => handler(isMax);
      ipcRenderer.on("window:maximized", listener);
      return () => {
        ipcRenderer.removeListener("window:maximized", listener);
      };
    },
  },
} as const;

export type ChitraApi = typeof api;

contextBridge.exposeInMainWorld("chitra", api);
