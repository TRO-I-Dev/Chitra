/**
 * Excalidraw element factory.
 *
 * Air Board commits its strokes into the board's existing Excalidraw sketch
 * layer rather than a private canvas, so anything drawn in the air is
 * afterwards selectable, editable, undoable and exportable exactly like
 * mouse-drawn ink — and it saves inside the `.chitra` archive for free.
 *
 * Elements are built by hand rather than through `convertToExcalidrawElements`
 * because that helper's skeleton type demands a fully-formed element for
 * freedraw anyway, and building them directly keeps every required field
 * explicit and in one place.
 */

import type { Box, Pt, ShapeKind } from "./strokeShaper.js";

/** Excalidraw's own `Point` is a positional tuple. */
type XY = [number, number];

let seq = 0;

function newId(): string {
  // Excalidraw only requires uniqueness within the scene.
  seq += 1;
  return `air-${Date.now().toString(36)}-${seq.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function randomInt(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export interface InkStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  /** 0 = ruler-straight, 1 = hand-drawn, 2 = artist. */
  roughness: number;
  opacity: number;
  /** Rounded corners on rectangles. */
  rounded: boolean;
}

export const DEFAULT_INK: InkStyle = {
  strokeColor: "#e7e7ee",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  rounded: true,
};

function base(style: InkStyle, x: number, y: number, width: number, height: number) {
  return {
    id: newId(),
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    groupIds: [] as string[],
    frameId: null,
    roundness: null as null | { type: number; value?: number },
    seed: randomInt(),
    version: 1,
    versionNonce: randomInt(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    // Tag every element Air Board makes. Lets us offer "select everything I
    // drew in the air" and keeps provenance in the saved file.
    customData: { chitraSource: "airboard" as const },
  };
}

/** ROUNDNESS.ADAPTIVE_RADIUS — inlined to avoid importing the heavy bundle. */
const ADAPTIVE_RADIUS = 3;

export function makeRectangle(box: Box, style: InkStyle): Record<string, unknown> {
  const el = base(style, box.x, box.y, box.w, box.h);
  return {
    ...el,
    type: "rectangle",
    roundness: style.rounded ? { type: ADAPTIVE_RADIUS } : null,
  };
}

export function makeEllipse(box: Box, style: InkStyle): Record<string, unknown> {
  return { ...base(style, box.x, box.y, box.w, box.h), type: "ellipse" };
}

export function makeDiamond(box: Box, style: InkStyle): Record<string, unknown> {
  return { ...base(style, box.x, box.y, box.w, box.h), type: "diamond" };
}

/**
 * Linear elements store points relative to (x,y), and the first point must be
 * [0,0] or Excalidraw's own bounds maths disagrees with the element's x/y.
 */
function linear(
  type: "line" | "arrow",
  pts: readonly Pt[],
  style: InkStyle,
  arrowhead: boolean,
): Record<string, unknown> {
  const ox = pts[0]?.x ?? 0;
  const oy = pts[0]?.y ?? 0;
  const rel: XY[] = pts.map((p) => [p.x - ox, p.y - oy]);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const el = base(style, ox, oy, width, height);
  return {
    ...el,
    type,
    points: rel,
    lastCommittedPoint: rel[rel.length - 1] ?? null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: arrowhead ? "arrow" : null,
    roundness: { type: 2 /* ROUNDNESS.PROPORTIONAL_RADIUS */ },
  };
}

export function makeLine(pts: readonly Pt[], style: InkStyle): Record<string, unknown> {
  return linear("line", pts, style, false);
}

export function makeArrow(pts: readonly Pt[], style: InkStyle): Record<string, unknown> {
  return linear("arrow", pts, style, true);
}

export function makeFreedraw(pts: readonly Pt[], style: InkStyle): Record<string, unknown> {
  const ox = pts[0]?.x ?? 0;
  const oy = pts[0]?.y ?? 0;
  const rel: XY[] = pts.map((p) => [p.x - ox, p.y - oy]);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  const el = base(
    style,
    ox,
    oy,
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  return {
    ...el,
    type: "freedraw",
    points: rel,
    // Air strokes carry no pressure signal; let Excalidraw synthesise the
    // taper so they read like natural ink rather than a uniform ribbon.
    pressures: [],
    simulatePressure: true,
    lastCommittedPoint: rel[rel.length - 1] ?? null,
  };
}

export function makeText(
  text: string,
  at: Pt,
  style: InkStyle,
  fontSize = 20,
): Record<string, unknown> {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((l) => l.length)) * fontSize * 0.52;
  const height = lines.length * fontSize * 1.25;
  const el = base(style, at.x, at.y, width, height);
  return {
    ...el,
    type: "text",
    text,
    originalText: text,
    fontSize,
    fontFamily: 1, // FONT_FAMILY.Virgil — the hand-drawn face
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    baseline: fontSize * 0.9,
    lineHeight: 1.25,
  };
}

/** Build the right element for a recognised shape. */
export function elementForShape(
  kind: ShapeKind,
  box: Box,
  points: readonly Pt[],
  style: InkStyle,
): Record<string, unknown> {
  switch (kind) {
    case "rectangle":
      return makeRectangle(box, style);
    case "ellipse":
      return makeEllipse(box, style);
    case "diamond":
      return makeDiamond(box, style);
    case "triangle":
      return makeLine(points, style);
    case "line":
      return makeLine(points, style);
    case "arrow":
      return makeArrow(points, style);
    case "freedraw":
    default:
      return makeFreedraw(points, style);
  }
}
