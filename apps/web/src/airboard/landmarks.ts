/**
 * Hand-landmark geometry.
 *
 * MediaPipe returns 21 normalised landmarks per hand in image space
 * (x,y ∈ [0,1], z relative to the wrist). Raw pixel distances are useless for
 * gesture thresholds because they scale with how close the hand is to the
 * camera — so every measurement here is normalised by a *hand scale* derived
 * from the palm itself, making thresholds distance-invariant.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Canonical MediaPipe hand-landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/** Bone pairs for drawing the skeleton in the camera preview. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist3D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * A scale-reference length for the hand: the mean of wrist→middle-MCP and
 * index-MCP→pinky-MCP. Both are rigid palm spans, so they stay stable while
 * the fingers move — unlike, say, wrist→index-tip.
 */
export function handScale(lms: readonly Landmark[]): number {
  const wrist = lms[LM.WRIST];
  const midMcp = lms[LM.MIDDLE_MCP];
  const idxMcp = lms[LM.INDEX_MCP];
  const pinkyMcp = lms[LM.PINKY_MCP];
  if (!wrist || !midMcp || !idxMcp || !pinkyMcp) return 1;
  const a = dist2D(wrist, midMcp);
  const b = dist2D(idxMcp, pinkyMcp);
  // Guard against a degenerate frame collapsing every ratio to Infinity.
  return Math.max((a + b) / 2, 1e-3);
}

const FINGERS = [
  { tip: LM.INDEX_TIP, pip: LM.INDEX_PIP, mcp: LM.INDEX_MCP },
  { tip: LM.MIDDLE_TIP, pip: LM.MIDDLE_PIP, mcp: LM.MIDDLE_MCP },
  { tip: LM.RING_TIP, pip: LM.RING_PIP, mcp: LM.RING_MCP },
  { tip: LM.PINKY_TIP, pip: LM.PINKY_PIP, mcp: LM.PINKY_MCP },
] as const;

/**
 * Per-finger extension in [0,1]-ish units: tip-to-MCP distance over
 * PIP-to-MCP distance. ~1.0 when curled into the palm, ~2.0 when straight.
 * Remapped so 0 = fully curled, 1 = fully extended.
 *
 * This is orientation-independent, unlike the common "tip.y < pip.y" test,
 * which breaks the moment the user rotates their hand or points sideways.
 */
function fingerExtension(lms: readonly Landmark[], tip: number, pip: number, mcp: number): number {
  const t = lms[tip];
  const p = lms[pip];
  const m = lms[mcp];
  if (!t || !p || !m) return 0;
  const ref = dist3D(p, m);
  if (ref < 1e-4) return 0;
  const ratio = dist3D(t, m) / ref;
  return clamp01((ratio - 1.05) / (2.05 - 1.05));
}

/** Thumb needs its own reference — its MCP/IP geometry differs from the fingers. */
function thumbExtension(lms: readonly Landmark[]): number {
  const tip = lms[LM.THUMB_TIP];
  const ip = lms[LM.THUMB_IP];
  const cmc = lms[LM.THUMB_CMC];
  const idxMcp = lms[LM.INDEX_MCP];
  if (!tip || !ip || !cmc || !idxMcp) return 0;
  // Distance from the thumb tip to the index MCP, normalised by palm width —
  // a tucked thumb sits on/near the index MCP, an abducted thumb is far away.
  const s = handScale(lms);
  return clamp01((dist3D(tip, idxMcp) / s - 0.45) / (1.25 - 0.45));
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The feature vector every gesture decision is made from. Each field is
 * scale-normalised, so thresholds calibrated at arm's length still hold when
 * the user leans toward the camera.
 */
export interface HandFeatures {
  /** Thumb-tip ↔ index-tip distance / hand scale. The primary "click". */
  pinchIndex: number;
  /** Thumb-tip ↔ middle-tip distance / hand scale. Secondary action. */
  pinchMiddle: number;
  /** Thumb-tip ↔ ring-tip distance / hand scale. */
  pinchRing: number;
  /** Thumb-tip ↔ pinky-tip distance / hand scale. */
  pinchPinky: number;
  /** Extension amount per digit, thumb first. 0 = curled, 1 = straight. */
  extension: [number, number, number, number, number];
  /** How many of the four fingers are extended past 0.5. */
  extendedCount: number;
  /** Mean of all finger extensions — high for an open palm, low for a fist. */
  openness: number;
  /** Palm centre (mean of wrist + the four MCPs) in normalised image space. */
  palm: { x: number; y: number };
  /** Index fingertip in normalised image space — the natural pointer. */
  indexTip: { x: number; y: number };
  /** Midpoint of thumb + index tips — the natural *pinch* point. */
  pinchPoint: { x: number; y: number };
  /** Palm roll in radians: angle of the index-MCP → pinky-MCP axis. */
  roll: number;
  /** Reference length used for normalisation; also a rough proximity cue. */
  scale: number;
}

export function extractFeatures(lms: readonly Landmark[]): HandFeatures | null {
  if (lms.length < 21) return null;
  const s = handScale(lms);
  const thumb = lms[LM.THUMB_TIP];
  const index = lms[LM.INDEX_TIP];
  const middle = lms[LM.MIDDLE_TIP];
  const ring = lms[LM.RING_TIP];
  const pinky = lms[LM.PINKY_TIP];
  const wrist = lms[LM.WRIST];
  const idxMcp = lms[LM.INDEX_MCP];
  const midMcp = lms[LM.MIDDLE_MCP];
  const ringMcp = lms[LM.RING_MCP];
  const pinkyMcp = lms[LM.PINKY_MCP];
  if (!thumb || !index || !middle || !ring || !pinky) return null;
  if (!wrist || !idxMcp || !midMcp || !ringMcp || !pinkyMcp) return null;

  const ext: [number, number, number, number, number] = [
    thumbExtension(lms),
    fingerExtension(lms, FINGERS[0].tip, FINGERS[0].pip, FINGERS[0].mcp),
    fingerExtension(lms, FINGERS[1].tip, FINGERS[1].pip, FINGERS[1].mcp),
    fingerExtension(lms, FINGERS[2].tip, FINGERS[2].pip, FINGERS[2].mcp),
    fingerExtension(lms, FINGERS[3].tip, FINGERS[3].pip, FINGERS[3].mcp),
  ];

  return {
    pinchIndex: dist3D(thumb, index) / s,
    pinchMiddle: dist3D(thumb, middle) / s,
    pinchRing: dist3D(thumb, ring) / s,
    pinchPinky: dist3D(thumb, pinky) / s,
    extension: ext,
    extendedCount: ext.slice(1).filter((e) => e > 0.5).length,
    openness: (ext[1] + ext[2] + ext[3] + ext[4]) / 4,
    palm: {
      x: (wrist.x + idxMcp.x + midMcp.x + ringMcp.x + pinkyMcp.x) / 5,
      y: (wrist.y + idxMcp.y + midMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    },
    indexTip: { x: index.x, y: index.y },
    pinchPoint: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
    roll: Math.atan2(pinkyMcp.y - idxMcp.y, pinkyMcp.x - idxMcp.x),
    scale: s,
  };
}
