/**
 * Stroke post-processing: smoothing, simplification and shape recognition.
 *
 * Mid-air strokes are far noisier than mouse or stylus strokes — there is no
 * surface to rest against, so every line carries a low-frequency tremor the 1€
 * filter can't remove without adding visible lag. The fix is to clean up at
 * *commit* time, once the whole stroke is known:
 *
 *   1. Resample to uniform arc-length spacing (removes speed artefacts).
 *   2. Recognise the intended primitive geometrically.
 *   3. Emit either an exact primitive or a smoothed, simplified polyline.
 *
 * Recognition is geometric rather than template-based ($1/$P). Templates
 * classify well but only return a *label*; we need the actual parameters
 * (centre, radii, corners) to emit a clean Excalidraw element, and geometric
 * fitting gives us both at once — plus it is rotation-tolerant for free.
 */

export interface Pt {
  x: number;
  y: number;
}

export type ShapeKind =
  | "freedraw"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeResult {
  kind: ShapeKind;
  /** 0..1 — how confident the geometric fit is. */
  confidence: number;
  /** Axis-aligned bounds of the recognised shape. */
  box: Box;
  /** Polyline for `line` / `arrow` / `triangle` / `freedraw`, in absolute coords. */
  points: Pt[];
  /** Human-readable reason, surfaced in the HUD so the system feels legible. */
  why: string;
}

/* ------------------------------------------------------------------ */
/* Geometry primitives                                                 */
/* ------------------------------------------------------------------ */

export function pathLength(pts: readonly Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return d;
}

export function bounds(pts: readonly Pt[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Resample to `n` points spaced evenly along the path ($1 recognizer step 1). */
export function resample(pts: readonly Pt[], n: number): Pt[] {
  if (pts.length < 2 || n < 2) return [...pts];
  const total = pathLength(pts);
  if (total <= 0) return Array.from({ length: n }, () => ({ ...pts[0]! }));
  const interval = total / (n - 1);
  const out: Pt[] = [{ ...pts[0]! }];
  let carried = 0;
  let i = 1;
  let prev = pts[0]!;
  while (i < pts.length && out.length < n) {
    const cur = pts[i]!;
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (carried + d >= interval) {
      const t = (interval - carried) / d;
      const np = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(np);
      prev = np;
      carried = 0;
    } else {
      carried += d;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: readonly Pt[], epsilon: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxDist = -1;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplify(pts.slice(0, index + 1), epsilon);
    const right = simplify(pts.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/**
 * Chaikin corner-cutting — two passes turn a jittery polyline into something
 * that reads as deliberate ink without the overshoot a spline would add.
 */
export function chaikin(pts: readonly Pt[], passes = 2): Pt[] {
  let cur = [...pts];
  for (let pass = 0; pass < passes; pass++) {
    if (cur.length < 3) return cur;
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!;
      const b = cur[i + 1]!;
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

/** Signed polygon area (shoelace). */
function polygonArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Corner detection by local turn angle over a fixed arc-length window.
 * Returns indices into the (resampled) point array, one per corner cluster.
 */
function findCorners(pts: readonly Pt[], closed: boolean): number[] {
  const n = pts.length;
  const k = Math.max(2, Math.round(n / 20));
  const scores: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const ia = i - k;
    const ib = i + k;
    if (!closed && (ia < 0 || ib >= n)) continue;
    const a = pts[((ia % n) + n) % n]!;
    const b = pts[i]!;
    const c = pts[((ib % n) + n) % n]!;
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const m1 = Math.hypot(v1x, v1y);
    const m2 = Math.hypot(v2x, v2y);
    if (m1 < 1e-6 || m2 < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
    // 0 when the path runs straight through, 1 at a hairpin.
    scores[i] = 1 - Math.acos(cos) / Math.PI;
  }

  // Non-maximum suppression inside a window, then threshold.
  const CORNER_MIN = 0.28; // ≈ turn sharper than ~130°
  const corners: number[] = [];
  const window = Math.max(2, Math.round(n / 12));
  for (let i = 0; i < n; i++) {
    const s = scores[i]!;
    if (s < CORNER_MIN) continue;
    let isMax = true;
    for (let j = -window; j <= window; j++) {
      const idx = closed ? (((i + j) % n) + n) % n : i + j;
      if (idx < 0 || idx >= n || idx === i) continue;
      if (scores[idx]! > s) {
        isMax = false;
        break;
      }
    }
    if (isMax) corners.push(i);
  }
  return corners;
}

/** Mean absolute residual of the points against a straight start→end line. */
function straightness(pts: readonly Pt[]): number {
  if (pts.length < 3) return 1;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  if (span < 1e-6) return 0;
  let sum = 0;
  for (const p of pts) sum += perpendicularDistance(p, a, b);
  return 1 - Math.min(1, sum / pts.length / (span * 0.12));
}

/* ------------------------------------------------------------------ */
/* Recognition                                                         */
/* ------------------------------------------------------------------ */

const SAMPLES = 64;

/**
 * Recognise the primitive a stroke was meant to be.
 *
 * @param raw      stroke points in board coordinates
 * @param strength 0..1 snapping aggressiveness. 0 always returns freedraw,
 *                 1 accepts even loose fits. Wired to the Air Board slider.
 */
export function recognizeShape(raw: readonly Pt[], strength = 0.62): ShapeResult {
  const pts = dedupe(raw);
  const box = bounds(pts);
  const diag = Math.hypot(box.w, box.h);
  const freehand: ShapeResult = {
    kind: "freedraw",
    confidence: 0,
    box,
    points: chaikin(simplify(pts, Math.max(diag * 0.004, 0.6)), 2),
    why: "Kept as freehand ink",
  };

  if (strength <= 0.01) return freehand;
  if (pts.length < 6 || diag < 12) return freehand;

  const perimeter = pathLength(pts);
  const sampled = resample(pts, SAMPLES);
  const start = sampled[0]!;
  const end = sampled[SAMPLES - 1]!;
  const gap = Math.hypot(end.x - start.x, end.y - start.y);
  // A stroke counts as closed if it ends within 22% of its own path length of
  // where it began — scale-free, so it works for a 40px and a 900px shape.
  const closed = gap < perimeter * 0.22;

  // `strength` widens/narrows every acceptance gate uniformly.
  const tol = 0.5 + strength * 0.9;

  /* ---- open strokes: line or arrow ---- */
  if (!closed) {
    const str = straightness(sampled);
    if (str > 1 - 0.42 * tol) {
      const arrow = detectArrowHead(sampled, perimeter);
      if (arrow) {
        return {
          kind: "arrow",
          confidence: Math.min(1, str),
          box: bounds([arrow.from, arrow.to]),
          points: [arrow.from, arrow.to],
          why: "Straight stroke with an arrowhead",
        };
      }
      const tip = snapAxis(start, end, strength);
      return {
        kind: "line",
        confidence: Math.min(1, str),
        box: bounds([start, tip]),
        points: [start, tip],
        why: "Straight stroke",
      };
    }
    // A wide-open arc that never closes is still ink, not a shape.
    return freehand;
  }

  /* ---- closed strokes: rectangle / ellipse / diamond / triangle ---- */
  const area = polygonArea(sampled);
  const boxArea = Math.max(box.w * box.h, 1e-6);
  const fill = area / boxArea; // 1.0 rect · 0.785 ellipse · 0.5 diamond/triangle
  const corners = findCorners(sampled, true);
  const nCorners = corners.length;

  // Circularity: 4πA/P² is 1 for a perfect circle and ~0.785 for a square.
  const circularity = (4 * Math.PI * area) / Math.max(perimeter * perimeter, 1e-6);

  const candidates: Array<{ kind: ShapeKind; score: number; why: string }> = [
    {
      kind: "rectangle",
      score: score(fill, 1.0, 0.22) * 0.6 + score(nCorners, 4, 1.2) * 0.4,
      why: "Closed, 4 corners, fills its bounding box",
    },
    {
      kind: "ellipse",
      score:
        score(fill, Math.PI / 4, 0.14) * 0.45 +
        score(circularity, 0.95, 0.28) * 0.35 +
        score(nCorners, 0, 1.6) * 0.2,
      why: "Closed and smooth all the way round",
    },
    {
      kind: "diamond",
      score:
        score(fill, 0.5, 0.14) * 0.5 +
        score(nCorners, 4, 1.2) * 0.3 +
        diamondCornerBonus(sampled, corners, box) * 0.2,
      why: "Closed, 4 corners at the edge midpoints",
    },
    {
      kind: "triangle",
      score: score(fill, 0.5, 0.16) * 0.45 + score(nCorners, 3, 0.9) * 0.55,
      why: "Closed with 3 corners",
    },
  ];
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const runnerUp = candidates[1]!;

  // Require both an absolute fit and a margin over the next-best reading —
  // an ambiguous blob should stay as ink rather than snap to a wrong shape.
  const acceptAt = 0.78 - strength * 0.26;
  if (best.score < acceptAt || best.score - runnerUp.score < 0.05) return freehand;

  if (best.kind === "triangle") {
    const tri = corners.length >= 3 ? corners.slice(0, 3).map((i) => sampled[i]!) : null;
    if (!tri) return freehand;
    return {
      kind: "triangle",
      confidence: best.score,
      box: bounds(tri),
      points: [...tri, tri[0]!],
      why: best.why,
    };
  }

  return {
    kind: best.kind,
    confidence: best.score,
    box: squareUp(box, best.kind, strength),
    points: [],
    why: best.why,
  };
}

/** Gaussian-ish closeness score in [0,1]. */
function score(value: number, target: number, tolerance: number): number {
  const z = (value - target) / Math.max(tolerance, 1e-6);
  return Math.exp(-0.5 * z * z);
}

/** Diamonds put their corners near the midpoints of the bounding box edges. */
function diamondCornerBonus(pts: readonly Pt[], corners: readonly number[], box: Box): number {
  if (corners.length < 3 || box.w < 1e-6 || box.h < 1e-6) return 0;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let hits = 0;
  for (const i of corners) {
    const p = pts[i]!;
    const nearVerticalMid = Math.abs(p.x - cx) < box.w * 0.2;
    const nearHorizontalMid = Math.abs(p.y - cy) < box.h * 0.2;
    if (nearVerticalMid !== nearHorizontalMid) hits++;
  }
  return Math.min(1, hits / 4);
}

/**
 * Nudge a nearly-square box to exactly square, and a nearly-circular ellipse
 * to a circle. People aim for regular shapes far more often than they aim for
 * a 103×97 rectangle.
 */
function squareUp(box: Box, kind: ShapeKind, strength: number): Box {
  if (kind !== "rectangle" && kind !== "ellipse" && kind !== "diamond") return box;
  const ratio = box.w / Math.max(box.h, 1e-6);
  const tol = 0.08 + strength * 0.07;
  if (Math.abs(ratio - 1) > tol) return box;
  const side = (box.w + box.h) / 2;
  return {
    x: box.x + (box.w - side) / 2,
    y: box.y + (box.h - side) / 2,
    w: side,
    h: side,
  };
}

/** Snap a line to horizontal/vertical/45° when it's within a few degrees. */
function snapAxis(a: Pt, b: Pt, strength: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return b;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const tolRad = (5 + strength * 8) * (Math.PI / 180);
  if (Math.abs(angle - snapped) > tolRad) return b;
  return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
}

/**
 * An arrowhead is a short, sharp double-back at the end of an otherwise
 * straight stroke: the last ~18% of the path reverses direction hard.
 */
function detectArrowHead(pts: readonly Pt[], perimeter: number): { from: Pt; to: Pt } | null {
  const n = pts.length;
  if (n < 12) return null;
  const tailStart = Math.floor(n * 0.72);
  const shaft = pts.slice(0, tailStart);
  const tail = pts.slice(tailStart);
  if (shaft.length < 4 || tail.length < 3) return null;

  const shaftDir = norm({
    x: shaft[shaft.length - 1]!.x - shaft[0]!.x,
    y: shaft[shaft.length - 1]!.y - shaft[0]!.y,
  });
  const tailDir = norm({
    x: tail[tail.length - 1]!.x - tail[0]!.x,
    y: tail[tail.length - 1]!.y - tail[0]!.y,
  });
  const dot = shaftDir.x * tailDir.x + shaftDir.y * tailDir.y;
  // The head must double back (dot < 0) and be short relative to the shaft.
  if (dot > -0.15) return null;
  if (pathLength(tail) > perimeter * 0.35) return null;

  const tip = shaft[shaft.length - 1]!;
  return { from: shaft[0]!, to: tip };
}

function norm(v: Pt): Pt {
  const m = Math.hypot(v.x, v.y);
  return m < 1e-9 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
}

/** Drop consecutive duplicates — they poison angle and length maths. */
function dedupe(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.35) out.push(p);
  }
  return out.length >= 2 ? out : [...pts];
}
