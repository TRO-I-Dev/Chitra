/**
 * Gesture vocabulary, bindings and the user's calibration profile.
 *
 * Two kinds of gesture live here and they are recognised very differently:
 *
 * - **Pinch gestures** are driven by a single continuous channel (thumb-tip to
 *   fingertip distance / hand scale). They need sub-frame precision because
 *   they act as the pen-down signal, so they run through a Schmitt trigger
 *   with per-user on/off thresholds.
 * - **Pose gestures** are driven by the 5-element finger-extension vector and
 *   are classified by nearest calibrated centroid with a rejection margin.
 *
 * Everything a user can tune is in `GestureProfile`, which serialises to
 * localStorage so a calibration survives restarts.
 */

export type GestureId =
  | "pinch-index"
  | "pinch-middle"
  | "point"
  | "open-palm"
  | "fist"
  | "peace"
  | "thumbs-up"
  | "el";

export type AirAction = "none" | "draw" | "erase" | "pan" | "menu" | "commit" | "undo" | "select";

export interface GestureMeta {
  id: GestureId;
  label: string;
  /** One-line instruction shown during calibration. */
  instruction: string;
  kind: "pinch" | "pose";
  /** Which distance channel a pinch gesture watches. */
  channel?: "pinchIndex" | "pinchMiddle" | "pinchRing" | "pinchPinky";
  /** Nominal extension vector [thumb, index, middle, ring, pinky] for poses. */
  template?: readonly [number, number, number, number, number];
  glyph: string;
}

export const GESTURES: readonly GestureMeta[] = [
  {
    id: "pinch-index",
    label: "Pinch",
    instruction: "Touch your thumb and index fingertips together, then hold.",
    kind: "pinch",
    channel: "pinchIndex",
    glyph: "🤏",
  },
  {
    id: "pinch-middle",
    label: "Middle pinch",
    instruction: "Touch your thumb and middle fingertips together, then hold.",
    kind: "pinch",
    channel: "pinchMiddle",
    glyph: "👌",
  },
  {
    id: "point",
    label: "Point",
    instruction: "Extend your index finger only, curl the rest.",
    kind: "pose",
    template: [0.15, 1, 0.05, 0.05, 0.05],
    glyph: "☝",
  },
  {
    id: "open-palm",
    label: "Open palm",
    instruction: "Open your hand flat, all five fingers spread.",
    kind: "pose",
    template: [1, 1, 1, 1, 1],
    glyph: "🖐",
  },
  {
    id: "fist",
    label: "Fist",
    instruction: "Close your hand into a fist.",
    kind: "pose",
    template: [0.1, 0.02, 0.02, 0.02, 0.02],
    glyph: "✊",
  },
  {
    id: "peace",
    label: "Two fingers",
    instruction: "Extend index and middle fingers, curl ring and pinky.",
    kind: "pose",
    template: [0.2, 1, 1, 0.05, 0.05],
    glyph: "✌",
  },
  {
    id: "thumbs-up",
    label: "Thumbs up",
    instruction: "Make a fist with your thumb sticking out.",
    kind: "pose",
    template: [1, 0.02, 0.02, 0.02, 0.02],
    glyph: "👍",
  },
  {
    id: "el",
    label: "L shape",
    instruction: "Extend thumb and index into an L, curl the rest.",
    kind: "pose",
    template: [1, 1, 0.05, 0.05, 0.05],
    glyph: "🤟",
  },
] as const;

export const ACTION_LABELS: Record<AirAction, string> = {
  none: "— nothing —",
  draw: "Draw / drag",
  erase: "Erase",
  pan: "Pan the board",
  menu: "Open + browse tool ring",
  commit: "Commit shape",
  undo: "Undo",
  select: "Choose highlighted option",
};

/** Per-gesture calibration produced by the wizard. */
export interface GestureCalibration {
  /** Pinch: distance below which the gesture engages. */
  onThreshold?: number;
  /** Pinch: distance above which it disengages. Always > onThreshold. */
  offThreshold?: number;
  /** Pose: the user's own extension vector for this pose. */
  centroid?: [number, number, number, number, number];
  /** Pose: mean spread observed while sampling — feeds the acceptance radius. */
  spread?: number;
  /**
   * Pose: **per-axis** standard deviation observed while sampling.
   *
   * This is what makes a calibration worth taking. A single scalar spread says
   * "this pose was held loosely"; per-axis deviation says *which fingers* were
   * held loosely. Someone making a fist may clamp their index rigidly while
   * their pinky drifts — so index deviation should be treated as significant
   * evidence and pinky deviation largely ignored. The classifier divides each
   * axis by its own deviation to get exactly that.
   */
  deviation?: [number, number, number, number, number];
  /** When this gesture was last calibrated (ISO). */
  calibratedAt?: string;
}

export type Handedness = "Left" | "Right" | "Any";

export interface GestureProfile {
  /**
   * 1 → the original pinch-to-draw / two-fingers-for-menu bindings.
   * 2 → open palm browses the ring, fist chooses, index finger draws.
   *
   * Bumping this re-derives the bindings on load while *keeping* the user's
   * calibration — the hand measurements are still valid, only the mapping of
   * gesture to action changed.
   */
  version: 2;
  /** Which hand drives the cursor. "Any" uses whichever hand scores highest. */
  hand: Handedness;
  /** gesture id → action. */
  bindings: Record<GestureId, AirAction>;
  /** gesture id → calibration (absent = use built-in defaults). */
  calibration: Partial<Record<GestureId, GestureCalibration>>;
  /** 1€ filter tuning, surfaced in the UI as a single "smoothing" slider. */
  smoothing: number;
  /** Cursor speed multiplier applied around the centre of the active area. */
  sensitivity: number;
  /**
   * The sub-rectangle of the camera frame mapped onto the whole board, as
   * {x,y,w,h} in normalised image coords. Shrinking it means less arm travel
   * covers the full board — the single biggest comfort win in mid-air input.
   */
  activeArea: { x: number; y: number; w: number; h: number };
  /**
   * Learn the reach envelope from the user's own movement instead of trusting
   * `activeArea`. On by default, because a fixed rectangle can't account for
   * seating distance, arm length or the camera's field of view — and when it's
   * wrong the cursor pins against a clamp, which reads as "it doesn't move".
   */
  autoReach: boolean;
  /** Mirror horizontally so moving right moves the cursor right. */
  mirror: boolean;
  /** Frames a pose must persist before it fires. Higher = fewer misfires. */
  poseDebounceFrames: number;
  /** Auto-straighten freehand strokes into clean shapes. */
  shapeSnap: boolean;
  /** How aggressive shape snapping is (0 = never, 1 = always). */
  shapeSnapStrength: number;
  /** Dwell (ms) with a still cursor that triggers a click/commit. */
  dwellMs: number;
  /**
   * Palm openness above which the tool ring scrubs freely, and below which the
   * highlighted option latches. The gap between the two is deliberate: closing
   * a hand into a fist drags the fingertip several centimetres, so without a
   * latch the selection would slide off the wedge the user aimed at.
   */
  ringScrubOpenness: number;
  ringLatchOpenness: number;
}

export const DEFAULT_PROFILE: GestureProfile = {
  version: 2,
  hand: "Any",
  bindings: {
    // Open palm browses, fist chooses, index finger draws.
    "open-palm": "menu",
    fist: "select",
    point: "draw",
    // Pinch stays bound to draw as a precision alternative — it's a smaller,
    // steadier motion than holding a point, and some users prefer it.
    "pinch-index": "draw",
    "pinch-middle": "erase",
    peace: "pan",
    "thumbs-up": "commit",
    el: "undo",
  },
  calibration: {},
  smoothing: 0.5,
  sensitivity: 1,
  // Only a starting point; `autoReach` replaces it within a second of use.
  activeArea: { x: 0.2, y: 0.18, w: 0.6, h: 0.6 },
  autoReach: true,
  mirror: true,
  poseDebounceFrames: 4,
  shapeSnap: true,
  shapeSnapStrength: 0.62,
  dwellMs: 700,
  ringScrubOpenness: 0.62,
  ringLatchOpenness: 0.42,
};

/** Built-in pinch thresholds, used until the user calibrates. */
export const DEFAULT_PINCH: Record<string, { on: number; off: number }> = {
  pinchIndex: { on: 0.38, off: 0.52 },
  pinchMiddle: { on: 0.42, off: 0.58 },
  pinchRing: { on: 0.5, off: 0.66 },
  pinchPinky: { on: 0.56, off: 0.72 },
};

/**
 * Map the 0..1 "smoothing" slider onto 1€ filter coefficients.
 * 0 → twitchy but instant; 1 → glassy but ~80ms behind the hand.
 */
export function smoothingToOneEuro(smoothing: number): {
  minCutoff: number;
  beta: number;
  dCutoff: number;
} {
  const s = Math.max(0, Math.min(1, smoothing));
  return {
    // 4.0 Hz (loose) down to 0.4 Hz (heavy).
    minCutoff: 4.0 - 3.6 * s,
    // More smoothing needs more velocity compensation or fast strokes lag.
    beta: 0.004 + 0.02 * s,
    dCutoff: 1.0,
  };
}

const STORAGE_KEY = "chitra.airboard.profile.v1";

/** Newest profile version this build understands. */
export const PROFILE_VERSION = 2 as const;

export function loadProfile(): GestureProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<GestureProfile> & { version?: number };
    if (typeof parsed.version !== "number" || parsed.version > PROFILE_VERSION) {
      return DEFAULT_PROFILE;
    }
    const migrated = migrate(parsed);
    // Write the upgraded profile straight back, so the stored record matches
    // what's actually in use and the migration runs exactly once.
    if (parsed.version !== PROFILE_VERSION) saveProfile(migrated);
    return migrated;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * Bring a stored profile up to the current version.
 *
 * The v1→v2 step deliberately **discards the saved bindings** — v1 mapped
 * two-fingers to the menu and the fist to panning, and silently keeping those
 * would mean an existing user never sees the palm/fist flow. Calibration is
 * kept: it measures the user's hand, which hasn't changed.
 */
function migrate(stored: Partial<GestureProfile> & { version?: number }): GestureProfile {
  const fromV1 = (stored.version ?? 1) < 2;
  // Merge field-by-field so a profile saved by an older build that lacks a
  // newly-added key still loads instead of silently resetting everything.
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    bindings: fromV1
      ? { ...DEFAULT_PROFILE.bindings }
      : { ...DEFAULT_PROFILE.bindings, ...(stored.bindings ?? {}) },
    calibration: { ...(stored.calibration ?? {}) },
    activeArea: { ...DEFAULT_PROFILE.activeArea, ...(stored.activeArea ?? {}) },
    version: PROFILE_VERSION,
  };
}

export function saveProfile(profile: GestureProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota — calibration just won't persist. */
  }
}

export function gestureMeta(id: GestureId): GestureMeta {
  const m = GESTURES.find((g) => g.id === id);
  if (!m) throw new Error(`Unknown gesture: ${id}`);
  return m;
}

/** Reverse lookup: which gesture (if any) is bound to an action. */
export function gestureForAction(profile: GestureProfile, action: AirAction): GestureId | null {
  const hit = (Object.keys(profile.bindings) as GestureId[]).find(
    (g) => profile.bindings[g] === action,
  );
  return hit ?? null;
}
