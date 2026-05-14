import { z } from "zod";
import { Project, RecentProject } from "./schemas.js";

/**
 * Typed IPC contract.
 *
 *   Renderer  ──invoke(channel, args)──▶  Main
 *             ◀───────  result  ────────
 *
 * Each channel has a request/response zod schema. The preload bridge validates
 * BOTH directions and the renderer hook layer reuses the inferred TS types.
 */

export const IpcChannel = {
  AppVersion: "app:version",
  ProjectNew: "project:new",
  ProjectOpen: "project:open",
  ProjectSave: "project:save",
  ProjectSaveAs: "project:saveAs",
  RecentsList: "recents:list",
  RecentsClear: "recents:clear",
} as const;
export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Request / response schemas keyed by channel. */
export const IpcSchemas = {
  [IpcChannel.AppVersion]: {
    request: z.void(),
    response: z.object({ version: z.string(), electron: z.string(), node: z.string() }),
  },
  [IpcChannel.ProjectNew]: {
    request: z.object({ name: z.string().min(1) }),
    response: Project,
  },
  [IpcChannel.ProjectOpen]: {
    request: z.object({ path: z.string().optional() }),
    response: z.object({ path: z.string(), project: Project }).nullable(),
  },
  [IpcChannel.ProjectSave]: {
    request: z.object({ path: z.string(), project: Project }),
    response: z.object({ path: z.string(), savedAt: z.string() }),
  },
  [IpcChannel.ProjectSaveAs]: {
    request: z.object({ project: Project }),
    response: z.object({ path: z.string(), savedAt: z.string() }).nullable(),
  },
  [IpcChannel.RecentsList]: {
    request: z.void(),
    response: z.array(RecentProject),
  },
  [IpcChannel.RecentsClear]: {
    request: z.void(),
    response: z.object({ ok: z.literal(true) }),
  },
} as const satisfies Record<IpcChannel, { request: z.ZodTypeAny; response: z.ZodTypeAny }>;

export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IpcSchemas)[C]["request"]>;
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IpcSchemas)[C]["response"]>;
