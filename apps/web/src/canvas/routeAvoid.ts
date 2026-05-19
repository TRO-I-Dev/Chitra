/**
 * Coarse-grid orthogonal router used by edges with `shape: "avoid"`.
 * Snaps source / target to a 20-px grid, marks every node bbox (inflated
 * by `MARGIN`) as blocked, and BFS-searches a Manhattan path between
 * source and target. If no path is found within the cap, falls back to a
 * simple two-segment elbow.
 */

const GRID = 20;
const MARGIN = 24;
const MAX_VISITED = 12_000;

export interface RouterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteInput {
  source: { x: number; y: number };
  target: { x: number; y: number };
  /** All node bounding boxes that should be avoided. The router will
   *  remove any rect that contains the source or target point — those
   *  are the start/end nodes' own bboxes. */
  obstacles: RouterRect[];
}

interface Cell {
  cx: number;
  cy: number;
}

function pointInRect(px: number, py: number, r: RouterRect): boolean {
  return px >= r.x - MARGIN && px <= r.x + r.w + MARGIN
      && py >= r.y - MARGIN && py <= r.y + r.h + MARGIN;
}

/** Returns the SVG path string (`"M x,y L x,y …"`) and the polyline
 *  vertices in flow coordinates. */
export function routeAvoid(input: RouteInput): { path: string; points: Array<{ x: number; y: number }> } {
  const sx = Math.round(input.source.x / GRID) * GRID;
  const sy = Math.round(input.source.y / GRID) * GRID;
  const tx = Math.round(input.target.x / GRID) * GRID;
  const ty = Math.round(input.target.y / GRID) * GRID;

  // Filter out any obstacle that contains either endpoint — these are
  // the source / target nodes' own bboxes; we must not block ourselves
  // out of starting.
  const obstacles = input.obstacles.filter(
    (r) => !pointInRect(input.source.x, input.source.y, r) &&
           !pointInRect(input.target.x, input.target.y, r),
  );

  // Build a bbox covering the whole search area + a healthy margin so
  // the router can route around obstacles. Bound it so we don't search
  // the whole plane.
  const all = [...obstacles.map((r) => ({ x: r.x, y: r.y })), { x: sx, y: sy }, { x: tx, y: ty }];
  const allR = [
    ...obstacles.map((r) => ({ x: r.x + r.w, y: r.y + r.h })),
    { x: sx, y: sy },
    { x: tx, y: ty },
  ];
  const minX = Math.min(...all.map((p) => p.x)) - 4 * GRID;
  const minY = Math.min(...all.map((p) => p.y)) - 4 * GRID;
  const maxX = Math.max(...allR.map((p) => p.x)) + 4 * GRID;
  const maxY = Math.max(...allR.map((p) => p.y)) + 4 * GRID;

  const isBlocked = (px: number, py: number): boolean => {
    if (px < minX || px > maxX || py < minY || py > maxY) return true;
    for (const r of obstacles) {
      if (pointInRect(px, py, r)) return true;
    }
    return false;
  };

  // BFS over the grid. Each cell key is "x,y" in flow coords.
  const startKey = `${sx},${sy}`;
  const targetKey = `${tx},${ty}`;
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(startKey, null);
  const queue: Cell[] = [{ cx: sx, cy: sy }];
  let found = false;
  let visited = 0;

  while (queue.length > 0 && visited < MAX_VISITED) {
    const cur = queue.shift()!;
    visited += 1;
    const key = `${cur.cx},${cur.cy}`;
    if (key === targetKey) {
      found = true;
      break;
    }
    // Four-way Manhattan neighbours. Try in order [toward target] for
    // BFS that biases toward the goal.
    const dx = Math.sign(tx - cur.cx);
    const dy = Math.sign(ty - cur.cy);
    const dirs: Array<[number, number]> = [
      [dx * GRID, 0],
      [0, dy * GRID],
      [-dx * GRID, 0],
      [0, -dy * GRID],
    ].filter(([ddx, ddy]) => ddx !== 0 || ddy !== 0) as Array<[number, number]>;
    for (const [ddx, ddy] of dirs) {
      const nx = cur.cx + ddx;
      const ny = cur.cy + ddy;
      const nkey = `${nx},${ny}`;
      if (cameFrom.has(nkey)) continue;
      // Allow target cell even if blocked by margin (we want to reach the node).
      if (nkey !== targetKey && isBlocked(nx, ny)) continue;
      cameFrom.set(nkey, key);
      queue.push({ cx: nx, cy: ny });
    }
  }

  if (!found) {
    // Fallback: elbow route through the midpoint between source and target.
    const midX = input.source.x;
    const midY = input.target.y;
    const pts = [
      input.source,
      { x: midX, y: midY },
      input.target,
    ];
    return { path: ptsToSvg(pts), points: pts };
  }

  // Reconstruct path from cameFrom.
  const cellPath: string[] = [];
  let k: string | null = targetKey;
  while (k) {
    cellPath.push(k);
    k = cameFrom.get(k) ?? null;
  }
  cellPath.reverse();

  // Convert cell keys to flow coords + collapse colinear runs.
  const rawPts = cellPath.map((kk) => {
    const [xs, ys] = kk.split(",");
    return { x: Number(xs), y: Number(ys) };
  });
  // Snap first / last to the actual source / target endpoints (avoid the
  // grid-snapping leaving a small jog).
  rawPts[0] = { ...input.source };
  rawPts[rawPts.length - 1] = { ...input.target };
  const simplified = collapseColinear(rawPts);

  return { path: ptsToSvg(simplified), points: simplified };
}

function collapseColinear(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pts.length <= 2) return pts;
  const out: Array<{ x: number; y: number }> = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const colinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!colinear) out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function ptsToSvg(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  let s = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i += 1) {
    s += ` L ${pts[i]!.x},${pts[i]!.y}`;
  }
  return s;
}
