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
  "straight",
  "depends-on",
  "sequence",
  "contains",
  "conflicts-with",
  "informs",
  "flows-to",
]);
export type EdgeKind = z.infer<typeof EdgeKind>;

/** Geometric path used to render the edge. Independent of the semantic
 *  `EdgeKind`: a "depends-on" edge can still be drawn as a straight line. */
export const EdgeShape = z.enum(["straight", "smoothstep", "step", "bezier"]);
export type EdgeShape = z.infer<typeof EdgeShape>;

/** Stroke pattern. `solid` is the default; `dashed`/`dotted` override the
 *  kind-default dasharray. */
export const EdgeDash = z.enum(["solid", "dashed", "dotted"]);
export type EdgeDash = z.infer<typeof EdgeDash>;

/** Per-edge style overrides. Any field left undefined falls back to the
 *  defaults from the edge's semantic `kind` (see `EDGE_STYLES`). */
export const EdgeStyleOverride = z
  .object({
    shape: EdgeShape.optional(),
    stroke: z.string().min(1).max(32).optional(),
    strokeWidth: z.number().min(0.5).max(10).optional(),
    dash: EdgeDash.optional(),
    animated: z.boolean().optional(),
  })
  .strict();
export type EdgeStyleOverride = z.infer<typeof EdgeStyleOverride>;

export const BoardEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  /** Handle id on the source node (e.g. "r-src"). When unset, the renderer
   *  picks the side closest to the target so the line never zig-zags
   *  through unrelated nodes. */
  sourceHandle: z.string().min(1).optional(),
  /** Handle id on the target node (e.g. "l-tgt"). Same fallback rules. */
  targetHandle: z.string().min(1).optional(),
  kind: EdgeKind.default("straight"),
  label: z.string().optional(),
  style: EdgeStyleOverride.optional(),
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
