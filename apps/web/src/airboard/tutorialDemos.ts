/**
 * Live demonstrations for the tutorial.
 *
 * Every preview here runs the *production* pipeline. The "pen" demo doesn't
 * play a canned animation of a circle appearing — it feeds a synthetic wobbly
 * stroke through `recognizeShape()` and renders whatever comes back. So the
 * tutorial can't drift out of sync with the behaviour it documents: retune the
 * recogniser and these previews change with it. If the recogniser would fail
 * on a shape, the tutorial visibly fails on it too, which is the honest thing
 * for a tutorial to do.
 */

import type { AirTool } from "./airBoardStore.js";
import { type Box, type Pt, type ShapeResult, recognizeShape } from "./strokeShaper.js";

/* ------------------------------------------------------------------ */
/* Synthetic strokes — hand-drawn-looking, deterministic               */
/* ------------------------------------------------------------------ */

/** Deterministic pseudo-noise so a demo looks the same on every loop. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
}

/** All generators emit points in a 0..1 box; the player scales to the canvas. */
export function wobblyCircle(amount = 0.02, seed = 7): Pt[] {
  const n = noise(seed);
  return Array.from({ length: 64 }, (_, i) => {
    const t = (i / 63) * Math.PI * 2;
    return {
      x: 0.5 + Math.cos(t) * 0.33 + n() * amount,
      y: 0.5 + Math.sin(t) * 0.33 + n() * amount,
    };
  });
}

export function wobblyRect(amount = 0.02, seed = 11): Pt[] {
  const n = noise(seed);
  const corners: Pt[] = [
    { x: 0.16, y: 0.2 },
    { x: 0.84, y: 0.2 },
    { x: 0.84, y: 0.8 },
    { x: 0.16, y: 0.8 },
    { x: 0.16, y: 0.2 },
  ];
  const out: Pt[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let s = 0; s < 16; s++) {
      const t = s / 16;
      out.push({
        x: a.x + (b.x - a.x) * t + n() * amount,
        y: a.y + (b.y - a.y) * t + n() * amount,
      });
    }
  }
  out.push(corners[0]!);
  return out;
}

export function wobblyArrow(seed = 23): Pt[] {
  const n = noise(seed);
  const shaft: Pt[] = Array.from({ length: 30 }, (_, i) => ({
    x: 0.14 + (i / 29) * 0.62 + n() * 0.012,
    y: 0.5 + n() * 0.012,
  }));
  // The head doubles back — exactly what `detectArrowHead` looks for.
  const head: Pt[] = Array.from({ length: 10 }, (_, i) => ({
    x: 0.76 - (i / 9) * 0.12,
    y: 0.5 - (i / 9) * 0.1,
  }));
  return [...shaft, ...head];
}

export function wobblyLine(seed = 31): Pt[] {
  const n = noise(seed);
  return Array.from({ length: 34 }, (_, i) => ({
    x: 0.14 + (i / 33) * 0.72 + n() * 0.01,
    y: 0.74 - (i / 33) * 0.48 + n() * 0.01,
  }));
}

export function wobblyDiamond(seed = 41): Pt[] {
  const n = noise(seed);
  const corners: Pt[] = [
    { x: 0.5, y: 0.14 },
    { x: 0.86, y: 0.5 },
    { x: 0.5, y: 0.86 },
    { x: 0.14, y: 0.5 },
    { x: 0.5, y: 0.14 },
  ];
  const out: Pt[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let s = 0; s < 14; s++) {
      const t = s / 14;
      out.push({ x: a.x + (b.x - a.x) * t + n() * 0.015, y: a.y + (b.y - a.y) * t + n() * 0.015 });
    }
  }
  return out;
}

/** Genuine scribble — the recogniser should refuse this and keep it as ink. */
export function scribble(seed = 57): Pt[] {
  const n = noise(seed);
  return Array.from({ length: 80 }, (_, i) => ({
    x: 0.5 + Math.sin(i * 0.6) * 0.28 + n() * 0.09,
    y: 0.5 + Math.cos(i * 1.1) * 0.24 + n() * 0.09,
  }));
}

/* ------------------------------------------------------------------ */
/* Per-tool demo scripts                                               */
/* ------------------------------------------------------------------ */

export interface ToolDemo {
  /** The raw stroke the "hand" traces. */
  stroke: Pt[];
  /** What the tool produces once the stroke is released. */
  outcome:
    | { kind: "recognized"; result: ShapeResult }
    | {
        kind: "primitive";
        shape: "rectangle" | "ellipse" | "diamond" | "arrow" | "line";
        box: Box;
        points: Pt[];
      }
    | { kind: "card"; box: Box }
    | { kind: "erase" }
    | { kind: "laser" };
  /** One line explaining what just happened, shown under the canvas. */
  caption: string;
}

/**
 * Recognise a stroke expressed in 0..1 space.
 *
 * `recognizeShape` reasons in board pixels and refuses anything smaller than a
 * few units across — a sane guard on the real canvas, but it rejects *every*
 * normalised demo stroke outright (a 0..1 stroke has a diagonal of ~1). So the
 * stroke is scaled up into pixel-like units for recognition and the result
 * scaled back down. Still the real recogniser, just fed units it understands.
 */
const RECOGNITION_SCALE = 320;

export function recognizeNormalized(stroke: readonly Pt[], strength: number): ShapeResult {
  const up = stroke.map((p) => ({ x: p.x * RECOGNITION_SCALE, y: p.y * RECOGNITION_SCALE }));
  const r = recognizeShape(up, strength);
  const d = (v: number): number => v / RECOGNITION_SCALE;
  return {
    ...r,
    box: { x: d(r.box.x), y: d(r.box.y), w: d(r.box.w), h: d(r.box.h) },
    points: r.points.map((p) => ({ x: d(p.x), y: d(p.y) })),
  };
}

/**
 * A square drawing stage centred in the canvas.
 *
 * Demo strokes are square (0..1 on both axes); mapping them onto a wide canvas
 * axis-by-axis stretches every circle into a fat ellipse and every hand into a
 * splayed one. Fitting a square keeps the geometry honest.
 */
export function stage(w: number, h: number): { s: number; ox: number; oy: number } {
  const s = Math.min(w, h);
  return { s, ox: (w - s) / 2, oy: (h - s) / 2 };
}

function boxOf(pts: readonly Pt[]): Box {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Build the demo for a tool.
 *
 * @param snapStrength the user's live shape-snapping setting, so the pen demo
 *                     shows what *their* slider currently does — including
 *                     showing raw ink if they've turned snapping off.
 */
export function demoForTool(tool: AirTool, snapStrength: number): ToolDemo {
  switch (tool) {
    case "pen": {
      const stroke = wobblyCircle();
      const result = recognizeNormalized(stroke, snapStrength);
      return {
        stroke,
        outcome: { kind: "recognized", result },
        caption:
          result.kind === "freedraw"
            ? "Snapping is off, so the stroke stays as raw ink."
            : `Recognised as ${result.kind} — ${result.why.toLowerCase()}.`,
      };
    }
    case "marker": {
      const stroke = wobblyLine();
      return {
        stroke,
        outcome: { kind: "recognized", result: recognizeNormalized(stroke, 0) },
        caption: "Thick and translucent, and never snapped — for highlighting, not structure.",
      };
    }
    case "rectangle": {
      const stroke = wobblyRect(0.008);
      return {
        stroke,
        outcome: { kind: "primitive", shape: "rectangle", box: boxOf(stroke), points: [] },
        caption: "Pinch or point at one corner, release at the opposite one.",
      };
    }
    case "ellipse": {
      const stroke = wobblyCircle(0.008);
      return {
        stroke,
        outcome: { kind: "primitive", shape: "ellipse", box: boxOf(stroke), points: [] },
        caption: "The drag defines the bounding box, not the radius.",
      };
    }
    case "diamond": {
      const stroke = wobblyDiamond();
      return {
        stroke,
        outcome: { kind: "primitive", shape: "diamond", box: boxOf(stroke), points: [] },
        caption: "The decision shape — handy for branch points in a flow.",
      };
    }
    case "arrow": {
      const stroke = wobblyLine();
      const a = stroke[0]!;
      const b = stroke[stroke.length - 1]!;
      return {
        stroke,
        outcome: { kind: "primitive", shape: "arrow", box: boxOf([a, b]), points: [a, b] },
        caption: "Drag from source to target; the head lands where you release.",
      };
    }
    case "line": {
      const stroke = wobblyLine(19);
      const a = stroke[0]!;
      const b = stroke[stroke.length - 1]!;
      return {
        stroke,
        outcome: { kind: "primitive", shape: "line", box: boxOf([a, b]), points: [a, b] },
        caption: "Snaps to horizontal, vertical or 45° when you're close.",
      };
    }
    case "card": {
      const stroke = wobblyRect(0.006);
      return {
        stroke,
        outcome: { kind: "card", box: boxOf(stroke) },
        caption: "Drag a box, type a title — it becomes a real Chitra card on the board.",
      };
    }
    case "eraser": {
      return {
        stroke: wobblyLine(77),
        outcome: { kind: "erase" },
        caption: "Sweep across ink to remove it. Forgiving — it clears anything close to the tip.",
      };
    }
    case "laser":
    default:
      return {
        stroke: wobblyCircle(0.03, 3),
        outcome: { kind: "laser" },
        caption: "Leaves a fading trail and draws nothing — for presenting, not authoring.",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Canvas rendering                                                    */
/* ------------------------------------------------------------------ */

export interface DemoStyle {
  stroke: string;
  width: number;
  accent: string;
}

/** Draw a normalised polyline into a canvas rect, up to `progress` (0..1). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  w: number,
  h: number,
  progress: number,
  style: DemoStyle,
  alpha = 1,
): void {
  const count = Math.max(2, Math.floor(pts.length * progress));
  if (count < 2) return;
  const { s, ox, oy } = stage(w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ox + pts[0]!.x * s, oy + pts[0]!.y * s);
  for (let i = 1; i < count; i++) ctx.lineTo(ox + pts[i]!.x * s, oy + pts[i]!.y * s);
  ctx.stroke();
  ctx.restore();
}

/** Render the committed outcome — the "what you get" half of every demo. */
export function drawOutcome(
  ctx: CanvasRenderingContext2D,
  demo: ToolDemo,
  w: number,
  h: number,
  style: DemoStyle,
  alpha = 1,
): void {
  const { s: size, ox, oy } = stage(w, h);
  ctx.save();
  // One transform for the whole outcome keeps the sub-renderers aspect-correct
  // without every one of them having to know about the stage.
  ctx.translate(ox, oy);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.accent;
  ctx.fillStyle = style.accent;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const w2 = size;
  const h2 = size;
  const o = demo.outcome;
  if (o.kind === "recognized") {
    drawShapeResult(ctx, o.result, w2, h2, style);
  } else if (o.kind === "primitive") {
    drawPrimitive(ctx, o.shape, o.box, o.points, w2, h2);
  } else if (o.kind === "card") {
    const b = o.box;
    ctx.globalAlpha = alpha * 0.2;
    roundRect(ctx, b.x * w2, b.y * h2, b.w * w2, b.h * h2, 10);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.fillText("New card", b.x * w2 + 10, b.y * h2 + 20);
  } else if (o.kind === "erase") {
    // Nothing remains — that *is* the outcome.
    ctx.globalAlpha = alpha * 0.5;
    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.fillText("ink removed", w2 * 0.5 - 32, h2 * 0.5);
  }
  ctx.restore();
}

function drawShapeResult(
  ctx: CanvasRenderingContext2D,
  r: ShapeResult,
  w: number,
  h: number,
  style: DemoStyle,
): void {
  if (r.kind === "freedraw") {
    // Inline rather than via `drawStroke`, which would apply the stage a
    // second time on top of the transform `drawOutcome` already set.
    ctx.beginPath();
    r.points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h),
    );
    ctx.stroke();
    return;
  }
  drawPrimitive(ctx, r.kind === "triangle" ? "line" : r.kind, r.box, r.points, w, h);
}

function drawPrimitive(
  ctx: CanvasRenderingContext2D,
  kind: "rectangle" | "ellipse" | "diamond" | "arrow" | "line",
  box: Box,
  points: readonly Pt[],
  w: number,
  h: number,
): void {
  ctx.beginPath();
  switch (kind) {
    case "rectangle":
      roundRect(ctx, box.x * w, box.y * h, box.w * w, box.h * h, 6);
      break;
    case "ellipse":
      ctx.ellipse(
        (box.x + box.w / 2) * w,
        (box.y + box.h / 2) * h,
        (box.w / 2) * w,
        (box.h / 2) * h,
        0,
        0,
        Math.PI * 2,
      );
      break;
    case "diamond":
      ctx.moveTo((box.x + box.w / 2) * w, box.y * h);
      ctx.lineTo((box.x + box.w) * w, (box.y + box.h / 2) * h);
      ctx.lineTo((box.x + box.w / 2) * w, (box.y + box.h) * h);
      ctx.lineTo(box.x * w, (box.y + box.h / 2) * h);
      ctx.closePath();
      break;
    case "arrow":
    case "line": {
      const a = points[0] ?? { x: box.x, y: box.y };
      const b = points[points.length - 1] ?? { x: box.x + box.w, y: box.y + box.h };
      ctx.moveTo(a.x * w, a.y * h);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x * w, points[i]!.y * h);
      if (points.length < 2) ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
      if (kind === "arrow") drawArrowHead(ctx, a, b, w, h);
      return;
    }
  }
  ctx.stroke();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w: number, h: number): void {
  const ang = Math.atan2((b.y - a.y) * h, (b.x - a.x) * w);
  const len = 11;
  ctx.beginPath();
  ctx.moveTo(b.x * w, b.y * h);
  ctx.lineTo(b.x * w - Math.cos(ang - 0.4) * len, b.y * h - Math.sin(ang - 0.4) * len);
  ctx.moveTo(b.x * w, b.y * h);
  ctx.lineTo(b.x * w - Math.cos(ang + 0.4) * len, b.y * h - Math.sin(ang + 0.4) * len);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
