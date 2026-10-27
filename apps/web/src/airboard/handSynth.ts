/**
 * Synthesises a plausible 21-landmark hand from a finger-extension vector.
 *
 * The tutorial needs to *show* each gesture, and the honest way to do that is
 * to render the same numbers the recogniser actually matches against: every
 * pose in `GESTURES` carries a `template` extension vector, so feeding that
 * template through here draws exactly the hand shape the classifier is looking
 * for. If a template is ever retuned, the tutorial illustration follows it
 * automatically instead of drifting into a lie.
 *
 * The model is deliberately planar and anatomically loose — it exists to be
 * legible at 120px, not to be correct.
 */

import { LM, type Landmark } from "./landmarks.js";

/** Where each finger's knuckle sits, and which way it points at full extension. */
interface FingerSpec {
  /** MCP position relative to the wrist, in normalised units. */
  mcp: [number, number];
  /** Direction the finger extends in, radians (−π/2 is straight up). */
  angle: number;
  /** Segment lengths: MCP→PIP, PIP→DIP, DIP→TIP. */
  segments: [number, number, number];
  /** Landmark indices for [MCP, PIP, DIP, TIP]. */
  indices: [number, number, number, number];
}

const FINGERS: readonly FingerSpec[] = [
  {
    mcp: [-0.1, -0.24],
    angle: -Math.PI / 2 - 0.18,
    segments: [0.16, 0.12, 0.1],
    indices: [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  },
  {
    mcp: [0.0, -0.27],
    angle: -Math.PI / 2,
    segments: [0.18, 0.13, 0.1],
    indices: [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  },
  {
    mcp: [0.1, -0.25],
    angle: -Math.PI / 2 + 0.16,
    segments: [0.16, 0.12, 0.09],
    indices: [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  },
  {
    mcp: [0.19, -0.2],
    angle: -Math.PI / 2 + 0.34,
    segments: [0.13, 0.1, 0.08],
    indices: [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
  },
];

/** Curl per joint at zero extension, radians. Distal joints curl hardest. */
const MAX_CURL: readonly [number, number, number] = [1.15, 1.25, 0.95];

/**
 * @param extension [thumb, index, middle, ring, pinky], each 0 (curled) to 1
 *                  (straight) — the same vector `extractFeatures` produces.
 * @param origin    wrist position in the output space.
 * @param scale     overall hand size.
 */
export function synthesizeHand(
  extension: readonly number[],
  origin: { x: number; y: number } = { x: 0.5, y: 0.9 },
  scale = 1,
): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const put = (i: number, x: number, y: number): void => {
    pts[i] = { x: origin.x + x * scale, y: origin.y + y * scale, z: 0 };
  };

  put(LM.WRIST, 0, 0);

  for (let f = 0; f < FINGERS.length; f++) {
    const spec = FINGERS[f]!;
    // extension[0] is the thumb, so finger f reads index f+1.
    const ext = clamp01(extension[f + 1] ?? 0);
    const curl = 1 - ext;

    let x = spec.mcp[0];
    let y = spec.mcp[1];
    put(spec.indices[0], x, y);

    // Walk the chain, accumulating curl so the fingertip folds toward the palm.
    let angle = spec.angle;
    for (let s = 0; s < 3; s++) {
      angle += curl * MAX_CURL[s]!;
      x += Math.cos(angle) * spec.segments[s]!;
      y += Math.sin(angle) * spec.segments[s]!;
      put(spec.indices[s + 1]!, x, y);
    }
  }

  /* ---- thumb: abducts sideways rather than curling into the palm ---- */
  const thumbExt = clamp01(extension[0] ?? 0);
  // Swings from tucked against the index MCP (0) to fully out to the side (1).
  const base = Math.PI + 0.55;
  const swing = base - thumbExt * 1.05;
  const cmc: [number, number] = [-0.02, -0.06];
  put(LM.THUMB_CMC, cmc[0], cmc[1]);
  let tx = cmc[0];
  let ty = cmc[1];
  let ta = swing;
  const thumbSegs = [0.11, 0.09, 0.08];
  const thumbIdx = [LM.THUMB_MCP, LM.THUMB_IP, LM.THUMB_TIP];
  for (let s = 0; s < 3; s++) {
    // A tucked thumb also folds forward slightly; an extended one stays straight.
    ta += (1 - thumbExt) * 0.3;
    tx += Math.cos(ta) * thumbSegs[s]!;
    ty += Math.sin(ta) * thumbSegs[s]!;
    put(thumbIdx[s]!, tx, ty);
  }

  return pts;
}

/** Linear blend between two extension vectors, for animating pose → pose. */
export function blendExtension(a: readonly number[], b: readonly number[], t: number): number[] {
  const k = clamp01(t);
  return [0, 1, 2, 3, 4].map((i) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * k);
}

/** A relaxed, neutral hand — the resting pose every demo animates out of. */
export const REST_POSE: readonly number[] = [0.5, 0.55, 0.55, 0.5, 0.5];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
