import type { BoardNode } from "@chitra/core";

/**
 * Snap engine — given the node currently being dragged and the rest of
 * the nodes on the board, computes the nearest snap target on each axis
 * (left / centre / right edges and top / middle / bottom edges of any
 * other node within a px threshold). Returns the snapped position plus
 * the alignment guide lines that should be drawn over the canvas while
 * the snap is active.
 */

const DEFAULT_W = 220;
const DEFAULT_H = 120;

/** Maximum distance (in flow pixels) at which a snap will engage. */
export const SNAP_THRESHOLD = 6;

export interface Guide {
  /** Orientation of the guide line. */
  axis: "x" | "y";
  /** Flow coordinate of the line (x for vertical, y for horizontal). */
  position: number;
  /** Start / end of the line on the other axis so it spans both
   *  participating nodes. */
  start: number;
  end: number;
}

export interface SnapResult {
  /** Position to apply after snap. Same as input if no snap. */
  position: { x: number; y: number };
  guides: Guide[];
}

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function toBox(node: { id: string; position: { x: number; y: number }; width?: number; height?: number }): Box {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    w: node.width ?? DEFAULT_W,
    h: node.height ?? DEFAULT_H,
  };
}

/** Candidate snap lines a single box contributes on a given axis. */
function xLines(b: Box): Array<{ pos: number; kind: "left" | "centre" | "right" }> {
  return [
    { pos: b.x, kind: "left" },
    { pos: b.x + b.w / 2, kind: "centre" },
    { pos: b.x + b.w, kind: "right" },
  ];
}

function yLines(b: Box): Array<{ pos: number; kind: "top" | "middle" | "bottom" }> {
  return [
    { pos: b.y, kind: "top" },
    { pos: b.y + b.h / 2, kind: "middle" },
    { pos: b.y + b.h, kind: "bottom" },
  ];
}

export interface SnapInput {
  /** The node being dragged, with its current (in-flight) position. */
  dragged: { id: string; position: { x: number; y: number }; width?: number; height?: number };
  /** Every other node on the board (the dragged node may be included; it
   *  will be filtered out by id). */
  others: BoardNode[];
  threshold?: number;
}

export function computeSnap(input: SnapInput): SnapResult {
  const threshold = input.threshold ?? SNAP_THRESHOLD;
  const me = toBox(input.dragged);
  const others = input.others
    .filter((n) => n.id !== me.id)
    .map(toBox);

  let snapDx = 0;
  let snapDy = 0;
  let bestDx = Infinity;
  let bestDy = Infinity;
  const guides: Guide[] = [];

  const myXs = xLines(me);
  const myYs = yLines(me);

  // X axis: try matching each of my left/centre/right against each other
  // box's left/centre/right.
  for (const other of others) {
    for (const mine of myXs) {
      for (const their of xLines(other)) {
        const dist = their.pos - mine.pos;
        const abs = Math.abs(dist);
        if (abs <= threshold && abs < bestDx) {
          bestDx = abs;
          snapDx = dist;
        }
      }
    }
    for (const mine of myYs) {
      for (const their of yLines(other)) {
        const dist = their.pos - mine.pos;
        const abs = Math.abs(dist);
        if (abs <= threshold && abs < bestDy) {
          bestDy = abs;
          snapDy = dist;
        }
      }
    }
  }

  const snappedX = me.x + (bestDx === Infinity ? 0 : snapDx);
  const snappedY = me.y + (bestDy === Infinity ? 0 : snapDy);

  // After snapping, collect EVERY other-box line that lines up exactly
  // with one of my snapped lines — these are the guides to draw.
  const snappedMe: Box = { ...me, x: snappedX, y: snappedY };
  const myXsFinal = xLines(snappedMe).map((l) => l.pos);
  const myYsFinal = yLines(snappedMe).map((l) => l.pos);

  for (const other of others) {
    for (const tx of xLines(other)) {
      if (myXsFinal.some((mx) => Math.abs(mx - tx.pos) < 0.5)) {
        // Vertical guide spanning top of higher box to bottom of lower box.
        const start = Math.min(snappedMe.y, other.y);
        const end = Math.max(snappedMe.y + snappedMe.h, other.y + other.h);
        guides.push({ axis: "x", position: tx.pos, start, end });
      }
    }
    for (const ty of yLines(other)) {
      if (myYsFinal.some((my) => Math.abs(my - ty.pos) < 0.5)) {
        const start = Math.min(snappedMe.x, other.x);
        const end = Math.max(snappedMe.x + snappedMe.w, other.x + other.w);
        guides.push({ axis: "y", position: ty.pos, start, end });
      }
    }
  }

  return {
    position: { x: snappedX, y: snappedY },
    guides,
  };
}
