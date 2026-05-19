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

/** Per-card visual overrides. All fields optional; undefined → fall back
 *  to the card type's defaults (CARD_TYPE_STYLES). Lets a user repaint a
 *  single card without affecting siblings of the same type. */
export const CardBorderStyle = z.enum(["solid", "dashed", "dotted", "none"]);
export type CardBorderStyle = z.infer<typeof CardBorderStyle>;

export const CardShadowPreset = z.enum(["none", "soft", "lift", "pop"]);
export type CardShadowPreset = z.infer<typeof CardShadowPreset>;

export const CardStyle = z
  .object({
    /** Card surface background (hex/rgba/CSS colour). Replaces the
     *  default type-based gradient when set. */
    bg: z.string().min(1).max(64).optional(),
    /** Border colour. */
    stroke: z.string().min(1).max(64).optional(),
    /** Body text colour. */
    text: z.string().min(1).max(64).optional(),
    /** Accent bar colour (left strip + selection ring). Falls back to
     *  legacy `card.color` then type colour. */
    accent: z.string().min(1).max(64).optional(),
    /** Corner radius in px (4 | 8 | 12 | 16 | 24 typically). */
    radius: z.number().min(0).max(40).optional(),
    /** Shadow strength preset. */
    shadow: CardShadowPreset.optional(),
    /** Border line style. `none` hides the border entirely. */
    border: CardBorderStyle.optional(),
    /** Border width in px. */
    borderWidth: z.number().min(0).max(6).optional(),
  })
  .strict();
export type CardStyle = z.infer<typeof CardStyle>;

export const Card = z.object({
  id: z.string().min(1),
  type: CardType,
  title: z.string(),
  body: RichDoc,
  tags: z.array(z.string()).default([]),
  color: z.string().optional(),
  icon: z.string().optional(),
  /** Rich visual overrides. */
  style: CardStyle.optional(),
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
export const EdgeShape = z.enum(["straight", "smoothstep", "step", "bezier", "avoid"]);
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

/** Where the description sits relative to the connector midline. */
export const EdgeLabelPlacement = z.enum(["above", "center", "below"]);
export type EdgeLabelPlacement = z.infer<typeof EdgeLabelPlacement>;

/** Rich description that sits above/below/on the connector midline.
 *  Independent of the simple `label` field — both can coexist (label
 *  in the centre pill, description above; useful for "depends on" +
 *  cardinality "1..*"). */
export const EdgeDescription = z
  .object({
    text: z.string().max(280),
    placement: EdgeLabelPlacement.default("above"),
    /** 0..1 position along the edge midline (0 = start, 1 = end). */
    t: z.number().min(0).max(1).optional(),
    /** Override colour; falls back to the edge stroke colour. */
    color: z.string().min(1).max(32).optional(),
    /** Background pill style. */
    background: z.enum(["solid", "outline", "none"]).default("solid"),
  })
  .strict();
export type EdgeDescription = z.infer<typeof EdgeDescription>;

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
  /** Rich description rendered as a floating pill on the edge. */
  description: EdgeDescription.optional(),
  /** Optional secondary label on the opposite side of the line
   *  (commonly used for cardinality). */
  secondaryLabel: EdgeDescription.optional(),
});
export type BoardEdge = z.infer<typeof BoardEdge>;

/* ------------------------------------------------------------------ *
 *  Board background                                                   *
 * ------------------------------------------------------------------ */

/** Canvas background rendering style. */
export const BackgroundKind = z.enum([
  "studio",   // animated blob wash (default Chitra look)
  "solid",    // single flat colour
  "dots",     // dot grid
  "grid",     // square grid lines
  "lines",    // horizontal ruled lines
  "iso",      // isometric grid (rotated lines)
  "gradient", // linear gradient between two colours
  "image",    // user-supplied image (stored in zip as data URL)
]);
export type BackgroundKind = z.infer<typeof BackgroundKind>;

export const BoardBackground = z
  .object({
    kind: BackgroundKind.default("studio"),
    /** Base canvas colour. */
    color: z.string().min(1).max(48).optional(),
    /** Secondary colour (grid lines, dots, gradient stop 2, etc.). */
    accent: z.string().min(1).max(48).optional(),
    /** Grid step in px (dots/grid/lines/iso). */
    size: z.number().min(2).max(200).optional(),
    /** Gradient angle in degrees, or iso-grid rotation. */
    angle: z.number().min(0).max(360).optional(),
    /** Named palette id (see backgroundPalettes). Sets sensible defaults
     *  for color/accent so users can pick a vibe without fiddling. */
    palette: z.string().min(1).max(48).optional(),
    /** Data URL for image-kind backgrounds (stored inline; soft cap 5MB,
     *  hard cap 25MB enforced by the editor UI). */
    imageUrl: z.string().optional(),
    /** Overall background opacity (0..1). */
    opacity: z.number().min(0).max(1).optional(),
    /** Blur in px (image/gradient). */
    blur: z.number().min(0).max(40).optional(),
  })
  .strict();
export type BoardBackground = z.infer<typeof BoardBackground>;

export const Board = z.object({
  id: z.string().min(1),
  name: z.string(),
  templateId: z.string().optional(),
  nodes: z.array(BoardNode).default([]),
  edges: z.array(BoardEdge).default([]),
  /** Optional Excalidraw scene data ({ elements, appState, files }). */
  sketch: z.record(z.unknown()).optional(),
  /** Per-board canvas background customization. Undefined → fall back to
   *  the project default, then the app default ("studio"). */
  background: BoardBackground.optional(),
});
export type Board = z.infer<typeof Board>;

/* ------------------------------------------------------------------ *
 *  Project theme — palette + font + global defaults                    *
 * ------------------------------------------------------------------ */

/** Named colour tokens applied as CSS custom properties when a palette
 *  is active. All fields optional so palettes can override just the
 *  bits they care about and fall through to the app defaults. */
export const PaletteTokens = z
  .object({
    canvasBg: z.string().min(1).max(48).optional(),
    canvasInk: z.string().min(1).max(48).optional(),
    canvasInkDim: z.string().min(1).max(48).optional(),
    accent: z.string().min(1).max(48).optional(),
    accent2: z.string().min(1).max(48).optional(),
    cardBg: z.string().min(1).max(48).optional(),
    cardStroke: z.string().min(1).max(48).optional(),
    cardText: z.string().min(1).max(48).optional(),
    edgeDefault: z.string().min(1).max(48).optional(),
    edgeEmphasis: z.string().min(1).max(48).optional(),
    selection: z.string().min(1).max(48).optional(),
    success: z.string().min(1).max(48).optional(),
    warn: z.string().min(1).max(48).optional(),
    danger: z.string().min(1).max(48).optional(),
  })
  .strict();
export type PaletteTokens = z.infer<typeof PaletteTokens>;

/** User-defined palette saved inside the .chitra project. Built-in
 *  palettes live in code and are referenced by id without showing up
 *  here. */
export const Palette = z
  .object({
    id: z.string().min(1).max(48),
    label: z.string().min(1).max(64),
    tokens: PaletteTokens,
  })
  .strict();
export type Palette = z.infer<typeof Palette>;

export const FontSource = z.enum(["system", "bundled", "google"]);
export type FontSource = z.infer<typeof FontSource>;

/** Project-wide font family. `family` is the CSS font-family string used
 *  as-is on the document root; `source: "google"` triggers a lazy
 *  `<link>` injection. */
export const FontConfig = z
  .object({
    family: z.string().min(1).max(80),
    source: FontSource.default("system"),
    /** Google Fonts weight axis values to request (default 400/600). */
    weights: z.array(z.number().int().min(100).max(900)).optional(),
  })
  .strict();
export type FontConfig = z.infer<typeof FontConfig>;

export const ProjectTheme = z
  .object({
    /** Built-in or user-defined palette id (looked up in code first,
     *  then `project.palettes`). */
    paletteId: z.string().min(1).max(48).optional(),
    /** Font applied to the whole app while the project is open. */
    font: FontConfig.optional(),
    /** Defaults for newly-created cards. Cards still keep per-card
     *  overrides on top. */
    defaultCardStyle: CardStyle.optional(),
    /** Defaults for newly-created edges. */
    defaultEdgeStyle: EdgeStyleOverride.optional(),
    /** Default background applied to boards that don't define their
     *  own. */
    defaultBackground: BoardBackground.optional(),
  })
  .strict();
export type ProjectTheme = z.infer<typeof ProjectTheme>;

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
  /** Project-wide theme (palette + font + defaults). Undefined → use
   *  the app default look. */
  theme: ProjectTheme.optional(),
  /** User-defined palettes saved with the project. */
  palettes: z.array(Palette).default([]),
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
