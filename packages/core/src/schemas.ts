import { z } from "zod";

/* ------------------------------------------------------------------ *
 *  Card                                                               *
 * ------------------------------------------------------------------ */

export const CardType = z.enum([
  "goal",
  "component",
  "persona",
  "metric",
  "risk",
  "step",
  "note",
  "decision",
  "data",
]);
export type CardType = z.infer<typeof CardType>;

export const CardSource = z.enum(["typed", "pasted", "imported"]);
export type CardSource = z.infer<typeof CardSource>;

/** TipTap document JSON — kept loose at the schema boundary. */
export const RichDoc = z.object({ type: z.string(), content: z.array(z.any()).optional() }).passthrough();
export type RichDoc = z.infer<typeof RichDoc>;

export const Card = z.object({
  id: z.string().min(1),
  type: CardType,
  title: z.string(),
  body: RichDoc,
  tags: z.array(z.string()).default([]),
  color: z.string().optional(),
  icon: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  source: CardSource.default("typed"),
  createdAt: z.string(), // ISO-8601
  updatedAt: z.string(),
});
export type Card = z.infer<typeof Card>;

/* ------------------------------------------------------------------ *
 *  Graph (Nodes + Edges on a Board)                                   *
 * ------------------------------------------------------------------ */

export const NodePosition = z.object({ x: z.number(), y: z.number() });
export type NodePosition = z.infer<typeof NodePosition>;

export const BoardNode = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  position: NodePosition,
  width: z.number().optional(),
  height: z.number().optional(),
  parentId: z.string().optional(),
  locked: z.boolean().default(false),
});
export type BoardNode = z.infer<typeof BoardNode>;

export const EdgeKind = z.enum([
  "depends-on",
  "sequence",
  "contains",
  "conflicts-with",
  "informs",
  "flows-to",
]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const BoardEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: EdgeKind.default("flows-to"),
  label: z.string().optional(),
});
export type BoardEdge = z.infer<typeof BoardEdge>;

export const Board = z.object({
  id: z.string().min(1),
  name: z.string(),
  templateId: z.string().optional(),
  nodes: z.array(BoardNode).default([]),
  edges: z.array(BoardEdge).default([]),
  /** Optional Excalidraw scene data ({ elements, appState, files }). */
  sketch: z.record(z.unknown()).optional(),
});
export type Board = z.infer<typeof Board>;

/* ------------------------------------------------------------------ *
 *  Project                                                            *
 * ------------------------------------------------------------------ */

export const Project = z.object({
  id: z.string().min(1),
  name: z.string(),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cards: z.array(Card).default([]),
  boards: z.array(Board).default([]),
});
export type Project = z.infer<typeof Project>;

/* ------------------------------------------------------------------ *
 *  Project file manifest (lives inside the .chitra zip)               *
 * ------------------------------------------------------------------ */

export const ProjectManifest = z.object({
  app: z.literal("chitra"),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string(),
});
export type ProjectManifest = z.infer<typeof ProjectManifest>;

/* ------------------------------------------------------------------ *
 *  Recents                                                            *
 * ------------------------------------------------------------------ */

export const RecentProject = z.object({
  path: z.string(),
  name: z.string(),
  lastOpenedAt: z.string(),
  thumbnail: z.string().optional(), // data URL
});
export type RecentProject = z.infer<typeof RecentProject>;
