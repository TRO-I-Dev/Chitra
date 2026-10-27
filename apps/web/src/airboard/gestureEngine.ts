/**
 * Gesture engine — turns a stream of hand landmarks into a cursor plus
 * discrete, debounced actions.
 *
 * Pipeline per frame:
 *   landmarks → features → pose classification (debounced)
 *                        → pinch gates (Schmitt-triggered)
 *                        → action resolution (pinch wins over pose)
 *   landmarks → pointer  → active-area remap → sensitivity → 1€ filter
 *
 * The engine is deliberately free of DOM and React so it can be unit-tested
 * and driven from recorded landmark fixtures.
 */

import { AdaptiveArea, type Rect } from "./adaptiveArea.js";
import {
  type AirAction,
  DEFAULT_PINCH,
  GESTURES,
  type GestureId,
  type GestureProfile,
  smoothingToOneEuro,
} from "./gestureProfile.js";
import { type HandFeatures, type Landmark, extractFeatures } from "./landmarks.js";
import { HysteresisGate, OneEuroFilter2D } from "./oneEuro.js";

export interface AirPoint {
  x: number;
  y: number;
}

export interface AirFrame {
  /** Cursor in normalised board space [0,1]², already smoothed and remapped. */
  cursor: AirPoint;
  /** Cursor speed in board units per second — drives the trail + dwell logic. */
  speed: number;
  /** Best-matching pose this frame, or null when nothing is confident. */
  pose: GestureId | null;
  /** Confidence of `pose` in [0,1]. */
  poseConfidence: number;
  /** The action the user is performing right now. */
  action: AirAction;
  /** True on the first frame of a new action. */
  actionStarted: boolean;
  /** True on the frame an action ends (reports the action that just ended). */
  actionEnded: AirAction | null;
  /** How closed the primary pinch is, 0 = open, 1 = fully closed. */
  pinchAmount: number;
  /**
   * Mean finger extension, 0 = tight fist, 1 = flat open palm.
   *
   * The tool ring uses this directly rather than waiting for the `open-palm`
   * or `fist` pose to classify: it needs a *continuous* reading to know when
   * the hand has started closing, so it can latch the highlighted option
   * before the fingertip drags off it.
   */
  openness: number;
  /**
   * Which board edge the cursor is pinned against this frame, -1/0/+1 per
   * axis. Surfaced so the HUD can tell the user "you've run out of reach"
   * instead of leaving them to conclude the cursor is broken.
   */
  edge: { x: number; y: number };
  /** Cursor has been effectively still for `dwellMs` — a hands-free "click". */
  dwellFired: boolean;
  /** Progress toward the dwell click, 0..1. Drives the radial dwell ring. */
  dwellProgress: number;
  /** Raw landmarks of the driving hand, for the camera preview skeleton. */
  landmarks: readonly Landmark[] | null;
  /** Which hand is driving. */
  handedness: string | null;
  features: HandFeatures | null;
  /** True when no hand is currently visible. */
  lost: boolean;
}

const EMPTY_FRAME: AirFrame = {
  cursor: { x: 0.5, y: 0.5 },
  speed: 0,
  pose: null,
  poseConfidence: 0,
  action: "none",
  actionStarted: false,
  actionEnded: null,
  pinchAmount: 0,
  openness: 0,
  edge: { x: 0, y: 0 },
  dwellFired: false,
  dwellProgress: 0,
  landmarks: null,
  handedness: null,
  features: null,
  lost: true,
};

export interface DetectedHand {
  landmarks: readonly Landmark[];
  handedness: string;
  score: number;
}

/** Weights for the pose distance metric — index/middle carry the most signal. */
const POSE_WEIGHTS: readonly [number, number, number, number, number] = [
  0.9, 1.25, 1.15, 0.85, 0.85,
];

/**
 * Acceptance gate, in standard deviations of the calibrated pose.
 *
 * ~2.6σ on a weighted 5-axis fit: generous enough that a normally-held pose
 * lands inside it, tight enough that a different pose doesn't.
 */
const POSE_ACCEPT_SIGMAS = 2.6;
/**
 * The winner must be at least this much closer than the runner-up, as a ratio.
 * A ratio rather than an absolute margin, so the test behaves the same whether
 * both candidates fit well or both fit badly.
 */
const POSE_MARGIN_RATIO = 0.75;

/**
 * Per-axis deviation is clamped before use.
 *
 * The floor stops a pose held unnaturally still during calibration from making
 * that axis infinitely sensitive (one frame of tremor would reject the pose).
 * The ceiling stops a wildly-held axis from being ignored altogether, which
 * would let genuinely different poses collide.
 */
function clampSigma(sigma: number | undefined): number {
  // 0.2 is a sane generic spread for an uncalibrated axis, and makes the
  // uncalibrated path reduce to plain weighted Euclidean distance.
  if (sigma === undefined || !Number.isFinite(sigma)) return 0.2;
  return Math.min(Math.max(sigma, 0.05), 0.3);
}

export class GestureEngine {
  private profile: GestureProfile;
  private readonly cursorFilter = new OneEuroFilter2D();
  private readonly gates = new Map<GestureId, HysteresisGate>();

  private lastCursor: AirPoint | null = null;
  private lastTime: number | null = null;
  private currentAction: AirAction = "none";
  private candidatePose: GestureId | null = null;
  private candidateFrames = 0;
  private stablePose: GestureId | null = null;
  private stableConfidence = 0;
  private dwellAnchor: AirPoint | null = null;
  private dwellSince: number | null = null;
  private dwellConsumed = false;
  private lostSince: number | null = null;
  private readonly adaptive = new AdaptiveArea();
  /** -1 / 0 / +1 — which board edge the cursor is currently pinned against. */
  private edgeX = 0;
  private edgeY = 0;

  constructor(profile: GestureProfile) {
    this.profile = profile;
    this.applyProfile(profile);
  }

  /** Hot-swap the profile (calibration wizard, settings sliders). */
  applyProfile(profile: GestureProfile): void {
    this.profile = profile;
    this.cursorFilter.setOptions(smoothingToOneEuro(profile.smoothing));
    for (const g of GESTURES) {
      if (g.kind !== "pinch" || !g.channel) continue;
      const cal = profile.calibration[g.id];
      const fallback = DEFAULT_PINCH[g.channel] ?? { on: 0.4, off: 0.55 };
      const on = cal?.onThreshold ?? fallback.on;
      // Guarantee a real hysteresis band even if a calibration produced a
      // degenerate (or inverted) pair — otherwise the gate chatters.
      const off = Math.max(cal?.offThreshold ?? fallback.off, on * 1.18);
      const existing = this.gates.get(g.id);
      if (existing) existing.setThresholds(on, off);
      else this.gates.set(g.id, new HysteresisGate(on, off, 45));
    }
  }

  reset(): void {
    this.cursorFilter.reset();
    for (const gate of this.gates.values()) gate.reset();
    this.lastCursor = null;
    this.lastTime = null;
    this.currentAction = "none";
    this.candidatePose = null;
    this.candidateFrames = 0;
    this.stablePose = null;
    this.dwellAnchor = null;
    this.dwellSince = null;
    this.dwellConsumed = false;
    this.lostSince = null;
  }

  /**
   * Advance one frame.
   * @param hands every hand MediaPipe found this frame
   * @param t     monotonic timestamp in ms
   */
  update(hands: readonly DetectedHand[], t: number): AirFrame {
    const hand = this.pickHand(hands);
    if (!hand) return this.handleLost(t);
    this.lostSince = null;

    const features = extractFeatures(hand.landmarks);
    if (!features) return this.handleLost(t);

    /* ---------- cursor ---------- */
    // The index fingertip *is* the pen. Users aim with the fingertip and
    // expect ink to appear there, so any blend toward the thumb reads as the
    // cursor lagging behind the finger — and it makes pointing to draw feel
    // subtly wrong. A pinch barely moves the index tip, so using it directly
    // costs nothing when drawing by pinch instead.
    const mapped = this.mapToBoard(features.indexTip);
    const cursor = this.cursorFilter.filter(mapped, t);

    const dt = this.lastTime === null ? 1 / 60 : Math.max((t - this.lastTime) / 1000, 1e-4);
    const speed = this.lastCursor
      ? Math.hypot(cursor.x - this.lastCursor.x, cursor.y - this.lastCursor.y) / dt
      : 0;
    this.lastCursor = cursor;
    this.lastTime = t;

    /* ---------- pinch gates ---------- */
    // A closed fist also brings the thumb and index tips together, so on raw
    // distance alone it reads as a pinch. Since the fist is now the *select*
    // gesture that would fire a draw on every menu confirmation. What actually
    // separates the two is the other fingers: a pinch leaves them relaxed or
    // extended, a fist curls them into the palm.
    const trailingExtension =
      (features.extension[2] + features.extension[3] + features.extension[4]) / 3;
    const pinchEligible = trailingExtension > 0.3;

    let pinchAction: AirAction = "none";
    let pinchGesture: GestureId | null = null;
    for (const g of GESTURES) {
      if (g.kind !== "pinch" || !g.channel) continue;
      const gate = this.gates.get(g.id);
      if (!gate) continue;
      if (!pinchEligible) {
        gate.reset();
        continue;
      }
      const engaged = gate.update(features[g.channel], t);
      const bound = this.profile.bindings[g.id];
      // First engaged pinch with a real binding wins; the list is ordered
      // index → middle → ring → pinky, i.e. most to least dexterous.
      if (engaged && bound !== "none" && pinchAction === "none") {
        pinchAction = bound;
        pinchGesture = g.id;
      }
    }

    /* ---------- pose classification ---------- */
    const { pose, confidence } = this.classifyPose(features);
    this.debouncePose(pose, confidence);

    /* ---------- action resolution ---------- */
    // A pinch is an explicit, high-precision act and outranks any pose, so a
    // pose flickering mid-stroke can't hijack a line the user is drawing.
    // Releasing the pinch hands control straight back to the pose layer.
    let action: AirAction = pinchAction;
    if (action === "none" && this.stablePose) {
      action = this.profile.bindings[this.stablePose] ?? "none";
    }

    const actionStarted = action !== "none" && action !== this.currentAction;
    const actionEnded =
      this.currentAction !== "none" && action !== this.currentAction ? this.currentAction : null;
    this.currentAction = action;

    /* ---------- dwell ---------- */
    const dwell = this.updateDwell(cursor, t, action);

    const primary = this.gates.get("pinch-index");
    const onT =
      this.profile.calibration["pinch-index"]?.onThreshold ?? DEFAULT_PINCH.pinchIndex!.on;
    const offT =
      this.profile.calibration["pinch-index"]?.offThreshold ?? DEFAULT_PINCH.pinchIndex!.off;
    const pinchAmount = clamp01(1 - (features.pinchIndex - onT) / Math.max(offT - onT, 1e-3));

    return {
      cursor,
      speed,
      pose: pinchGesture ?? this.stablePose,
      poseConfidence: pinchGesture ? 1 : this.stableConfidence,
      action,
      actionStarted,
      actionEnded,
      pinchAmount: primary?.value ? Math.max(pinchAmount, 0.85) : pinchAmount,
      openness: features.openness,
      edge: { x: this.edgeX, y: this.edgeY },
      dwellFired: dwell.fired,
      dwellProgress: dwell.progress,
      landmarks: hand.landmarks,
      handedness: hand.handedness,
      features,
      lost: false,
    };
  }

  /* ------------------------------------------------------------------ */

  private pickHand(hands: readonly DetectedHand[]): DetectedHand | null {
    if (hands.length === 0) return null;
    const want = this.profile.hand;
    if (want !== "Any") {
      // MediaPipe reports handedness from the camera's point of view; with a
      // mirrored preview the user's right hand is labelled "Left". Honour the
      // user's own choice by flipping when the view is mirrored.
      const target = this.profile.mirror ? (want === "Right" ? "Left" : "Right") : want;
      const match = hands.find((h) => h.handedness === target);
      if (match) return match;
    }
    return hands.reduce((best, h) => (h.score > best.score ? h : best), hands[0]!);
  }

  private handleLost(t: number): AirFrame {
    const endedAction = this.currentAction !== "none" ? this.currentAction : null;
    if (this.lostSince === null) this.lostSince = t;
    // Hold the last cursor briefly — a single dropped detection shouldn't
    // snap the pen back to centre mid-stroke.
    this.currentAction = "none";
    this.candidatePose = null;
    this.candidateFrames = 0;
    this.stablePose = null;
    this.dwellSince = null;
    this.dwellAnchor = null;
    for (const gate of this.gates.values()) gate.reset();
    if (t - this.lostSince > 400) this.cursorFilter.reset();
    return {
      ...EMPTY_FRAME,
      cursor: this.lastCursor ?? EMPTY_FRAME.cursor,
      actionEnded: endedAction,
    };
  }

  /**
   * Map a point in normalised camera space onto normalised board space.
   *
   * The source rectangle is the *learned* reach envelope when auto-reach is on
   * (see `AdaptiveArea`), falling back to the configured area otherwise. This
   * is what makes the whole board reachable without the user having to place
   * their hand in a region they can't see.
   */
  private mapToBoard(p: AirPoint): AirPoint {
    if (this.profile.autoReach) this.adaptive.observe(p);
    const a = this.profile.autoReach
      ? this.adaptive.rect(this.profile.activeArea)
      : this.profile.activeArea;

    let x = (p.x - a.x) / Math.max(a.w, 1e-3);
    let y = (p.y - a.y) / Math.max(a.h, 1e-3);
    if (this.profile.mirror) x = 1 - x;
    const s = this.profile.sensitivity;
    if (s !== 1) {
      x = 0.5 + (x - 0.5) * s;
      y = 0.5 + (y - 0.5) * s;
    }

    // Record whether we're pinned against an edge so the HUD can say so —
    // silently clamping is what makes a cursor feel broken rather than
    // out of range.
    this.edgeX = x < 0 ? -1 : x > 1 ? 1 : 0;
    this.edgeY = y < 0 ? -1 : y > 1 ? 1 : 0;

    return { x: clamp01(x), y: clamp01(y) };
  }

  /** Forget the learned reach envelope (settings, or a camera change). */
  resetReach(): void {
    this.adaptive.reset();
  }

  /** The rectangle currently mapped onto the board, for the camera preview. */
  get reachRect(): Rect {
    return this.profile.autoReach
      ? this.adaptive.rect(this.profile.activeArea)
      : this.profile.activeArea;
  }

  private classifyPose(f: HandFeatures): { pose: GestureId | null; confidence: number } {
    let best: GestureId | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    let secondD = Number.POSITIVE_INFINITY;

    for (const g of GESTURES) {
      if (g.kind !== "pose") continue;
      if (this.profile.bindings[g.id] === "none") continue;
      const cal = this.profile.calibration[g.id];
      const ref = cal?.centroid ?? g.template;
      if (!ref) continue;

      // Normalise each axis by how consistently the user holds *that* finger
      // in *this* pose. An axis they clamp rigidly becomes strong evidence; one
      // that always drifts is largely discounted. Uncalibrated poses fall back
      // to a single generic deviation, which reduces to plain weighted
      // Euclidean distance — so both paths stay on the same scale and the
      // margin comparison below remains meaningful.
      let sum = 0;
      let wsum = 0;
      for (let i = 0; i < 5; i++) {
        const w = POSE_WEIGHTS[i]!;
        const sigma = clampSigma(cal?.deviation?.[i]);
        const d = (f.extension[i]! - ref[i]!) / sigma;
        sum += w * d * d;
        wsum += w;
      }
      // Distance is now in units of standard deviations, not raw extension.
      const dist = Math.sqrt(sum / wsum);
      if (dist < bestD) {
        secondD = bestD;
        bestD = dist;
        best = g.id;
      } else if (dist < secondD) {
        secondD = dist;
      }
    }

    if (!best) return { pose: null, confidence: 0 };
    // The distance is in standard deviations now, so the gate is a fixed
    // statistical radius rather than a hand-tuned raw-extension number —
    // per-user tolerance already lives inside the per-axis deviations.
    if (bestD > POSE_ACCEPT_SIGMAS) return { pose: null, confidence: 0 };
    // Require the winner to be proportionally better, not just absolutely
    // better. A fixed margin is too strict when both fits are poor and too
    // loose when both are excellent; a ratio behaves sensibly at either end.
    if (Number.isFinite(secondD) && bestD > secondD * POSE_MARGIN_RATIO) {
      // Two poses are near-equally plausible — refuse rather than guess.
      return { pose: null, confidence: 0 };
    }
    return { pose: best, confidence: clamp01(1 - bestD / POSE_ACCEPT_SIGMAS) };
  }

  private debouncePose(pose: GestureId | null, confidence: number): void {
    if (pose === this.candidatePose) {
      this.candidateFrames++;
    } else {
      this.candidatePose = pose;
      this.candidateFrames = 1;
    }
    if (this.candidateFrames >= this.profile.poseDebounceFrames) {
      this.stablePose = pose;
      this.stableConfidence = confidence;
    }
  }

  private updateDwell(
    cursor: AirPoint,
    t: number,
    action: AirAction,
  ): { fired: boolean; progress: number } {
    // Dwell is a *substitute* for a click, so it must not fire while the user
    // is already mid-gesture — except while browsing the tool ring, which is
    // exactly where someone who can't make a crisp fist needs it most.
    if (action !== "none" && action !== "menu") {
      this.dwellSince = null;
      this.dwellAnchor = null;
      this.dwellConsumed = false;
      return { fired: false, progress: 0 };
    }
    const RADIUS = 0.022;
    if (
      !this.dwellAnchor ||
      Math.hypot(cursor.x - this.dwellAnchor.x, cursor.y - this.dwellAnchor.y) > RADIUS
    ) {
      this.dwellAnchor = cursor;
      this.dwellSince = t;
      this.dwellConsumed = false;
      return { fired: false, progress: 0 };
    }
    const held = t - (this.dwellSince ?? t);
    const progress = clamp01(held / Math.max(this.profile.dwellMs, 120));
    if (progress >= 1 && !this.dwellConsumed) {
      this.dwellConsumed = true;
      return { fired: true, progress: 1 };
    }
    return { fired: false, progress: this.dwellConsumed ? 0 : progress };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
