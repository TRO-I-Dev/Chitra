import type { EdgeDash, EdgeKind, EdgeShape, EdgeStyleOverride } from "@chitra/core";

interface EdgeStyle {
  label: string;
  stroke: string;
  /** "5,5" = dashed, undefined = solid */
  dasharray?: string;
  /** Animated dash offset for a flowing feel */
  animated: boolean;
}

export const EDGE_STYLES: Record<EdgeKind, EdgeStyle> = {
  straight:         { label: "line",        stroke: "#94a3b8", animated: false },
  "depends-on":     { label: "depends on",  stroke: "#fb7185", dasharray: "6,4", animated: false },
  sequence:         { label: "then",        stroke: "#a78bfa", animated: true },
  contains:         { label: "contains",    stroke: "#34d399", animated: false },
  "conflicts-with": { label: "conflicts",   stroke: "#f97316", dasharray: "2,3", animated: false },
  informs:          { label: "informs",     stroke: "#38bdf8", dasharray: "1,4", animated: false },
  "flows-to":       { label: "flows to",    stroke: "#7c5cff", animated: true },
};

export const EDGE_KINDS: EdgeKind[] = [
  "straight",
  "flows-to",
  "depends-on",
  "sequence",
  "contains",
  "conflicts-with",
  "informs",
];

/* --- Per-edge customization helpers ------------------------------------ */

export const EDGE_SHAPES: { value: EdgeShape; label: string; glyph: string }[] = [
  { value: "straight",   label: "Straight",  glyph: "─" },
  { value: "smoothstep", label: "Smooth",    glyph: "⌐" },
  { value: "step",       label: "Step",      glyph: "⌎" },
  { value: "bezier",     label: "Curve",     glyph: "∿" },
];

export const EDGE_DASHES: { value: EdgeDash; label: string }[] = [
  { value: "solid",  label: "Solid"  },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

/** Curated palette for the edge color picker. The first entry, `null`,
 *  represents "use the kind default". */
export const EDGE_COLORS: { value: string | null; label: string }[] = [
  { value: null,       label: "Auto"    },
  { value: "#94a3b8",  label: "Slate"   },
  { value: "#7c5cff",  label: "Violet"  },
  { value: "#21d4fd",  label: "Cyan"    },
  { value: "#34d399",  label: "Emerald" },
  { value: "#fbbf24",  label: "Amber"   },
  { value: "#fb7185",  label: "Rose"    },
  { value: "#f97316",  label: "Orange"  },
  { value: "#e2e8f0",  label: "Snow"    },
];

export function dashToArray(dash: EdgeDash | undefined): string | undefined {
  if (dash === "dashed") return "6,4";
  if (dash === "dotted") return "1,4";
  if (dash === "solid") return undefined;
  return undefined;
}

/** Resolve a (kind + override) pair into the concrete render parameters. */
export function resolveEdgeStyle(
  kind: EdgeKind,
  override: EdgeStyleOverride | undefined,
): {
  shape: EdgeShape;
  stroke: string;
  strokeWidth: number;
  dasharray: string | undefined;
  animated: boolean;
} {
  const base = EDGE_STYLES[kind];
  const ov = override ?? {};
  const shape: EdgeShape = ov.shape ?? (kind === "straight" ? "straight" : "smoothstep");
  return {
    shape,
    stroke: ov.stroke ?? base.stroke,
    strokeWidth: ov.strokeWidth ?? 1.5,
    // Explicit `solid` clears the kind default; otherwise an explicit dash
    // wins, otherwise fall through to the kind default.
    dasharray:
      ov.dash === "solid" ? undefined : ov.dash ? dashToArray(ov.dash) : base.dasharray,
    animated: ov.animated ?? base.animated,
  };
}

const RF_TYPE_BY_SHAPE: Record<EdgeShape, string> = {
  straight: "straight",
  smoothstep: "smoothstep",
  step: "step",
  bezier: "default",
};

export function shapeToRfType(shape: EdgeShape): string {
  return RF_TYPE_BY_SHAPE[shape];
}
