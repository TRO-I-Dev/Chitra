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
} as const;

export type ChitraApi = typeof api;

contextBridge.exposeInMainWorld("chitra", api);
