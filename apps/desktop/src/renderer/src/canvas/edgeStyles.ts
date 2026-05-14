import type { EdgeKind } from "@chitra/core";

interface EdgeStyle {
  label: string;
  stroke: string;
  /** "5,5" = dashed, undefined = solid */
  dasharray?: string;
  /** Animated dash offset for a flowing feel */
  animated: boolean;
}

export const EDGE_STYLES: Record<EdgeKind, EdgeStyle> = {
  "depends-on":     { label: "depends on",  stroke: "#fb7185", dasharray: "6,4", animated: false },
  sequence:         { label: "then",        stroke: "#a78bfa", animated: true },
  contains:         { label: "contains",    stroke: "#34d399", animated: false },
  "conflicts-with": { label: "conflicts",   stroke: "#f97316", dasharray: "2,3", animated: false },
  informs:          { label: "informs",     stroke: "#38bdf8", dasharray: "1,4", animated: false },
  "flows-to":       { label: "flows to",    stroke: "#7c5cff", animated: true },
};

export const EDGE_KINDS: EdgeKind[] = [
  "flows-to",
  "depends-on",
  "sequence",
  "contains",
  "conflicts-with",
  "informs",
];
