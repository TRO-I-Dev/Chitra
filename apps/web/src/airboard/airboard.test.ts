import { beforeEach, describe, expect, it } from "vitest";

import { AdaptiveArea } from "./adaptiveArea.js";
import { checkCalibration, poseSeparation } from "./calibrationQuality.js";
import { GestureEngine } from "./gestureEngine.js";
import { DEFAULT_PROFILE, loadProfile, saveProfile } from "./gestureProfile.js";
import { synthesizeHand } from "./handSynth.js";
import { type Landmark, extractFeatures } from "./landmarks.js";
import { HysteresisGate, OneEuroFilter } from "./oneEuro.js";
import { type Pt, recognizeShape, resample, simplify } from "./strokeShaper.js";

/* ------------------------------------------------------------------ */
/* Signal processing                                                    */
/* ------------------------------------------------------------------ */

describe("OneEuroFilter", () => {
  it("suppresses jitter on a stationary noisy signal", () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.01, dCutoff: 1 });
    // Deterministic pseudo-noise so the test can't flake.
    let seed = 42;
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648 - 0.5) * 0.04;
    };

    const raw: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < 120; i++) {
      const v = 0.5 + noise();
      raw.push(v);
      filtered.push(filter.filter(v, i * 16.7));
    }

    // Compare spread over the tail, once the filter has warmed up.
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    expect(spread(filtered.slice(40))).toBeLessThan(spread(raw.slice(40)) * 0.5);
  });

  it("lags less on fast movement than a plain low-pass", () => {
    // The whole point of the speed coefficient: at the same minimum cutoff,
    // raising beta must reduce lag while the signal is moving quickly.
    const adaptive = new OneEuroFilter({ minCutoff: 1, beta: 0.02, dCutoff: 1 });
    const plain = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    let a = 0;
    let p = 0;
    let target = 0;
    for (let i = 0; i < 60; i++) {
      target = i * 0.02;
      a = adaptive.filter(target, i * 16.7);
      p = plain.filter(target, i * 16.7);
    }
    expect(Math.abs(target - a)).toBeLessThan(Math.abs(target - p));
    // And it must still be tracking, not stuck near the start.
    expect(a).toBeGreaterThan(target * 0.75);
  });
});

describe("HysteresisGate", () => {
  it("does not chatter when the value sits on the threshold", () => {
    const gate = new HysteresisGate(0.4, 0.55, 40);
    let flips = 0;
    let prev = gate.value;
    for (let i = 0; i < 200; i++) {
      // Oscillate tightly around the ON threshold.
      const v = 0.4 + (i % 2 === 0 ? 0.005 : -0.005);
      const now = gate.update(v, i * 16.7);
      if (now !== prev) flips++;
      prev = now;
    }
    // A naive single-threshold comparison would flip ~100 times here.
    expect(flips).toBeLessThanOrEqual(1);
  });

  it("engages once the value is clearly past the threshold and held", () => {
    const gate = new HysteresisGate(0.4, 0.55, 40);
    for (let i = 0; i < 10; i++) gate.update(0.2, i * 16.7);
    expect(gate.value).toBe(true);
    // Values inside the hysteresis band must not release it.
    for (let i = 10; i < 20; i++) gate.update(0.5, i * 16.7);
    expect(gate.value).toBe(true);
    // Past the OFF threshold it releases.
    for (let i = 20; i < 30; i++) gate.update(0.7, i * 16.7);
    expect(gate.value).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Landmark features                                                    */
/* ------------------------------------------------------------------ */

/** A plausible open-hand landmark set; exact anatomy doesn't matter here. */
function syntheticHand(scale = 1, offset = 0): Landmark[] {
  const raw: Array<[number, number]> = [
    [0.5, 0.9], // wrist
    [0.42, 0.85],
    [0.36, 0.79],
    [0.32, 0.73],
    [0.29, 0.68], // thumb
    [0.44, 0.68],
    [0.42, 0.58],
    [0.41, 0.52],
    [0.4, 0.46], // index
    [0.5, 0.66],
    [0.5, 0.55],
    [0.5, 0.48],
    [0.5, 0.42], // middle
    [0.56, 0.67],
    [0.57, 0.57],
    [0.58, 0.5],
    [0.59, 0.45], // ring
    [0.62, 0.7],
    [0.64, 0.62],
    [0.65, 0.56],
    [0.66, 0.52], // pinky
  ];
  return raw.map(([x, y]) => ({ x: x * scale + offset, y: y * scale + offset, z: 0 }));
}

describe("extractFeatures", () => {
  it("produces scale-invariant measurements", () => {
    const near = extractFeatures(syntheticHand(1));
    const far = extractFeatures(syntheticHand(0.4));
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();

    // This is the property every threshold depends on: leaning toward the
    // camera must not change what counts as a pinch.
    expect(far!.pinchIndex).toBeCloseTo(near!.pinchIndex, 5);
    expect(far!.pinchMiddle).toBeCloseTo(near!.pinchMiddle, 5);
    for (let i = 0; i < 5; i++) {
      expect(far!.extension[i]).toBeCloseTo(near!.extension[i]!, 5);
    }
  });

  it("is translation-invariant for pinch distances", () => {
    const a = extractFeatures(syntheticHand(1, 0));
    const b = extractFeatures(syntheticHand(1, 0.2));
    expect(b!.pinchIndex).toBeCloseTo(a!.pinchIndex, 6);
  });

  it("rejects an incomplete landmark set rather than guessing", () => {
    expect(extractFeatures(syntheticHand().slice(0, 12))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Stroke geometry                                                      */
/* ------------------------------------------------------------------ */

describe("resample / simplify", () => {
  it("resamples to exactly n evenly-spaced points", () => {
    const line: Pt[] = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));
    const out = resample(line, 25);
    expect(out).toHaveLength(25);
    expect(out[0]!.x).toBeCloseTo(0, 4);
    expect(out[24]!.x).toBeCloseTo(100, 1);
  });

  it("collapses collinear runs", () => {
    const line: Pt[] = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(line, 0.5)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Shape recognition                                                    */
/* ------------------------------------------------------------------ */

/** Adds deterministic wobble so strokes look hand-drawn, not synthetic. */
function wobble(pts: Pt[], amount: number): Pt[] {
  let seed = 7;
  const n = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 2 * amount;
  };
  return pts.map((p) => ({ x: p.x + n(), y: p.y + n() }));
}

function circleStroke(cx: number, cy: number, r: number, n = 72): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r };
  });
}

function rectStroke(x: number, y: number, w: number, h: number, per = 18): Pt[] {
  const corners: Pt[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ];
  const out: Pt[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let s = 0; s < per; s++) {
      const t = s / per;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(corners[0]!);
  return out;
}

describe("recognizeShape", () => {
  it("reads a hand-drawn loop as an ellipse", () => {
    const r = recognizeShape(wobble(circleStroke(300, 300, 120), 4));
    expect(r.kind).toBe("ellipse");
    expect(r.box.w).toBeGreaterThan(200);
  });

  it("reads a hand-drawn box as a rectangle", () => {
    const r = recognizeShape(wobble(rectStroke(100, 100, 260, 180), 4));
    expect(r.kind).toBe("rectangle");
  });

  it("reads a straight sweep as a line", () => {
    const stroke: Pt[] = Array.from({ length: 40 }, (_, i) => ({ x: 50 + i * 8, y: 200 }));
    expect(recognizeShape(wobble(stroke, 2)).kind).toBe("line");
  });

  it("squares up a nearly-square box", () => {
    const r = recognizeShape(rectStroke(0, 0, 200, 208));
    expect(r.kind).toBe("rectangle");
    expect(r.box.w).toBeCloseTo(r.box.h, 6);
  });

  it("leaves genuine scribble as freehand ink", () => {
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const scribble: Pt[] = Array.from({ length: 90 }, (_, i) => ({
      x: 200 + Math.sin(i * 0.7) * 90 + rnd() * 60,
      y: 200 + Math.cos(i * 1.3) * 70 + rnd() * 60,
    }));
    expect(recognizeShape(scribble).kind).toBe("freedraw");
  });

  it("never snaps when the strength slider is at zero", () => {
    const r = recognizeShape(circleStroke(300, 300, 120), 0);
    expect(r.kind).toBe("freedraw");
    expect(r.points.length).toBeGreaterThan(2);
  });

  it("keeps a stroke too small to be meaningful as ink", () => {
    const tiny = circleStroke(10, 10, 3, 20);
    expect(recognizeShape(tiny).kind).toBe("freedraw");
  });
});

/* ------------------------------------------------------------------ */
/* Gesture profile — bindings and migration                             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "chitra.airboard.profile.v1";

/** Minimal localStorage so the profile module can run under node. */
function installLocalStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("gesture bindings", () => {
  it("maps the phase-1 flow: palm browses, fist chooses, finger draws", () => {
    expect(DEFAULT_PROFILE.bindings["open-palm"]).toBe("menu");
    expect(DEFAULT_PROFILE.bindings.fist).toBe("select");
    expect(DEFAULT_PROFILE.bindings.point).toBe("draw");
  });

  it("keeps the latch band strictly below the browse band", () => {
    // If these crossed, the ring could latch while the user is still
    // browsing — the selection would freeze mid-scrub.
    expect(DEFAULT_PROFILE.ringLatchOpenness).toBeLessThan(DEFAULT_PROFILE.ringScrubOpenness);
  });

  it("never binds two gestures to the same exclusive action", () => {
    const bindings = Object.values(DEFAULT_PROFILE.bindings);
    for (const action of ["menu", "select"] as const) {
      expect(bindings.filter((b) => b === action)).toHaveLength(1);
    }
  });
});

describe("profile migration", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("replaces v1 bindings but keeps the user's calibration", () => {
    const v1 = {
      version: 1,
      hand: "Left",
      // The old scheme, which must not survive.
      bindings: { "open-palm": "none", fist: "pan", peace: "menu", point: "none" },
      calibration: {
        "pinch-index": { onThreshold: 0.31, offThreshold: 0.49, calibratedAt: "2026-01-01" },
      },
      smoothing: 0.8,
      sensitivity: 1.4,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));

    const loaded = loadProfile();
    expect(loaded.version).toBe(2);
    // Rebound to the new flow…
    expect(loaded.bindings["open-palm"]).toBe("menu");
    expect(loaded.bindings.fist).toBe("select");
    expect(loaded.bindings.point).toBe("draw");
    // …while everything the user actually tuned survives.
    expect(loaded.calibration["pinch-index"]?.onThreshold).toBe(0.31);
    expect(loaded.smoothing).toBe(0.8);
    expect(loaded.sensitivity).toBe(1.4);
    expect(loaded.hand).toBe("Left");
  });

  it("honours custom bindings once the profile is already v2", () => {
    const v2 = { ...DEFAULT_PROFILE, bindings: { ...DEFAULT_PROFILE.bindings, el: "none" } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    expect(loadProfile().bindings.el).toBe("none");
  });

  it("falls back to defaults on a corrupt or future profile", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadProfile().version).toBe(2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadProfile().bindings.fist).toBe("select");
  });

  it("round-trips through save and load", () => {
    saveProfile({ ...DEFAULT_PROFILE, sensitivity: 1.75 });
    expect(loadProfile().sensitivity).toBe(1.75);
  });
});

describe("profile persistence", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("writes the upgraded profile back so migration runs only once", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, smoothing: 0.9 }));
    loadProfile();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.version).toBe(2);
    expect(stored.bindings.fist).toBe("select");
    expect(stored.smoothing).toBe(0.9);
  });
});

/* ------------------------------------------------------------------ */
/* Adaptive reach                                                       */
/* ------------------------------------------------------------------ */

describe("AdaptiveArea", () => {
  const FALLBACK = { x: 0.2, y: 0.18, w: 0.6, h: 0.6 };

  /** Maps a raw camera point through a rect the way the engine does. */
  const project = (p: { x: number; y: number }, r: typeof FALLBACK) => ({
    x: (p.x - r.x) / r.w,
    y: (p.y - r.y) / r.h,
  });

  it("falls back to the configured rect before it has seen anything", () => {
    expect(new AdaptiveArea().rect(FALLBACK)).toEqual(FALLBACK);
  });

  it("lets a small real-world sweep reach the whole board", () => {
    // A seated user whose fingertip only covers the middle of the frame. With
    // the fixed fallback this spans just 33% of the board — the "cursor
    // doesn't move" complaint. The learned envelope must fix that.
    const area = new AdaptiveArea();
    for (let i = 0; i < 200; i++) {
      const t = i / 199;
      area.observe({ x: 0.4 + t * 0.2, y: 0.45 + t * 0.2 });
    }
    const learned = area.rect(FALLBACK);

    const lo = project({ x: 0.4, y: 0.45 }, learned);
    const hi = project({ x: 0.6, y: 0.65 }, learned);
    const spanLearned = hi.x - lo.x;

    const fLo = project({ x: 0.4, y: 0.45 }, FALLBACK);
    const fHi = project({ x: 0.6, y: 0.65 }, FALLBACK);
    expect(spanLearned).toBeGreaterThan((fHi.x - fLo.x) * 2);
    // And the extremes land near the board edges rather than mid-canvas.
    expect(lo.x).toBeLessThan(0.25);
    expect(hi.x).toBeGreaterThan(0.75);
  });

  it("never collapses the span when the hand is held still", () => {
    // Without a floor, a motionless hand would drive the gain to infinity and
    // the cursor would explode on the first twitch.
    const area = new AdaptiveArea();
    for (let i = 0; i < 500; i++) area.observe({ x: 0.5, y: 0.5 });
    const r = area.rect(FALLBACK);
    expect(r.w).toBeGreaterThanOrEqual(0.15);
    expect(r.h).toBeGreaterThanOrEqual(0.15);
  });

  it("expands immediately when the user reaches somewhere new", () => {
    const area = new AdaptiveArea();
    for (let i = 0; i < 100; i++) area.observe({ x: 0.5, y: 0.5 });
    const before = area.rect(FALLBACK);
    area.observe({ x: 0.95, y: 0.5 });
    const after = area.rect(FALLBACK);
    // One frame is enough — reaching somewhere new must work on the first try.
    expect(after.x + after.w).toBeGreaterThan(before.x + before.w);
    expect(after.x + after.w).toBeGreaterThanOrEqual(0.95);
  });

  it("forgets everything on reset", () => {
    const area = new AdaptiveArea();
    for (let i = 0; i < 100; i++) area.observe({ x: 0.1 + i * 0.008, y: 0.5 });
    expect(area.rect(FALLBACK)).not.toEqual(FALLBACK);
    area.reset();
    expect(area.rect(FALLBACK)).toEqual(FALLBACK);
  });
});

/* ------------------------------------------------------------------ */
/* Calibration quality                                                  */
/* ------------------------------------------------------------------ */

const cal = (
  centroid: [number, number, number, number, number],
  deviation: [number, number, number, number, number],
) => ({ centroid, deviation, spread: deviation.reduce((a, b) => a + b, 0) / 5, calibratedAt: "x" });

describe("poseSeparation", () => {
  it("scores clearly different poses as well separated", () => {
    const palm = cal([1, 1, 1, 1, 1], [0.05, 0.05, 0.05, 0.05, 0.05]);
    const fist = cal([0.1, 0.02, 0.02, 0.02, 0.02], [0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(poseSeparation(palm, fist)).toBeGreaterThan(5);
  });

  it("scores near-identical poses as colliding", () => {
    // "point" and "L shape" recorded by someone whose thumb barely moves.
    const point = cal([0.2, 1, 0.05, 0.05, 0.05], [0.08, 0.06, 0.05, 0.05, 0.05]);
    const el = cal([0.28, 1, 0.05, 0.05, 0.05], [0.08, 0.06, 0.05, 0.05, 0.05]);
    expect(poseSeparation(point, el)).toBeLessThan(1.6);
  });

  it("treats a loosely-held axis as weaker evidence of difference", () => {
    const base = cal([0.5, 1, 0.05, 0.05, 0.05], [0.05, 0.05, 0.05, 0.05, 0.05]);
    const tight = cal([0.8, 1, 0.05, 0.05, 0.05], [0.05, 0.05, 0.05, 0.05, 0.05]);
    const loose = cal([0.8, 1, 0.05, 0.05, 0.05], [0.3, 0.05, 0.05, 0.05, 0.05]);
    // Same centroid gap on the thumb, but when the thumb is held loosely that
    // gap is much less trustworthy — so separation must be lower.
    expect(poseSeparation(base, loose)).toBeLessThan(poseSeparation(base, tight));
  });
});

describe("checkCalibration", () => {
  it("reports nothing for a clean, well-separated calibration", () => {
    expect(
      checkCalibration({
        "open-palm": cal([1, 1, 1, 1, 1], [0.04, 0.04, 0.04, 0.04, 0.04]),
        fist: cal([0.1, 0.02, 0.02, 0.02, 0.02], [0.04, 0.04, 0.04, 0.04, 0.04]),
      }),
    ).toEqual([]);
  });

  it("flags two poses that are too alike to tell apart", () => {
    const issues = checkCalibration({
      point: cal([0.2, 1, 0.05, 0.05, 0.05], [0.06, 0.05, 0.05, 0.05, 0.05]),
      el: cal([0.26, 1, 0.05, 0.05, 0.05], [0.06, 0.05, 0.05, 0.05, 0.05]),
    });
    const collision = issues.find((i) => i.kind === "collision");
    expect(collision).toBeTruthy();
    expect(collision!.gestures.sort()).toEqual(["el", "point"]);
    expect(collision!.message).toMatch(/too alike/i);
  });

  it("flags a pose that was held too loosely", () => {
    const issues = checkCalibration({
      fist: cal([0.1, 0.02, 0.02, 0.02, 0.02], [0.3, 0.3, 0.3, 0.3, 0.3]),
    });
    expect(issues.some((i) => i.kind === "unsteady")).toBe(true);
  });

  it("puts errors before warnings", () => {
    const issues = checkCalibration({
      point: cal([0.2, 1, 0.05, 0.05, 0.05], [0.3, 0.3, 0.3, 0.3, 0.3]),
      el: cal([0.2, 1, 0.05, 0.05, 0.05], [0.3, 0.3, 0.3, 0.3, 0.3]),
    });
    expect(issues.length).toBeGreaterThan(1);
    expect(issues[0]!.severity).toBe("error");
  });

  it("ignores gestures that were never recorded", () => {
    expect(checkCalibration({ fist: { onThreshold: 0.3 } })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Calibrated recognition, end to end                                   */
/* ------------------------------------------------------------------ */

/**
 * Builds a profile calibrated on the *measured* extension of a synthesised
 * hand, so the test exercises the real path: landmarks → features → calibrated
 * centroid → classifier → action.
 */
function calibratedProfile(
  poses: Partial<Record<"open-palm" | "fist" | "point", readonly number[]>>,
  deviation: [number, number, number, number, number] = [0.06, 0.06, 0.06, 0.06, 0.06],
) {
  const calibration: Record<string, unknown> = {};
  for (const [id, ext] of Object.entries(poses)) {
    const measured = extractFeatures(synthesizeHand(ext as number[], { x: 0.5, y: 0.8 }, 1));
    if (!measured) throw new Error("synth hand failed");
    calibration[id] = {
      centroid: [...measured.extension],
      deviation,
      spread: deviation.reduce((a, b) => a + b, 0) / 5,
      calibratedAt: "test",
    };
  }
  return { ...DEFAULT_PROFILE, poseDebounceFrames: 2, calibration } as typeof DEFAULT_PROFILE;
}

function feed(engine: GestureEngine, ext: readonly number[], frames = 8) {
  const hand = {
    landmarks: synthesizeHand(ext, { x: 0.5, y: 0.8 }, 1),
    handedness: "Right",
    score: 0.99,
  };
  let last = engine.update([hand], 0);
  for (let i = 1; i <= frames; i++) last = engine.update([hand], i * 16.7);
  return last;
}

const PALM = [1, 1, 1, 1, 1];
const FIST = [0.1, 0.02, 0.02, 0.02, 0.02];
const POINT = [0.15, 1, 0.05, 0.05, 0.05];

describe("calibrated pose recognition", () => {
  it("recognises each pose it was calibrated on", () => {
    const profile = calibratedProfile({ "open-palm": PALM, fist: FIST, point: POINT });

    expect(feed(new GestureEngine(profile), PALM).action).toBe("menu");
    expect(feed(new GestureEngine(profile), FIST).action).toBe("select");
    expect(feed(new GestureEngine(profile), POINT).action).toBe("draw");
  });

  it("does not confuse a fist for an open palm", () => {
    const profile = calibratedProfile({ "open-palm": PALM, fist: FIST });
    expect(feed(new GestureEngine(profile), FIST).action).not.toBe("menu");
    expect(feed(new GestureEngine(profile), PALM).action).not.toBe("select");
  });

  it("refuses a pose that sits between two calibrated ones", () => {
    // Halfway between palm and fist matches neither well enough to win by the
    // required margin, so the engine must decline rather than pick one.
    const profile = calibratedProfile({ "open-palm": PALM, fist: FIST });
    const between = PALM.map((v, i) => (v + FIST[i]!) / 2);
    expect(feed(new GestureEngine(profile), between).action).toBe("none");
  });

  it("accepts a wider range when the pose was recorded loosely", () => {
    // The whole point of per-axis deviation: a pose held loosely during
    // calibration must be judged loosely at runtime, and vice versa. Tested
    // comparatively so it doesn't depend on how the synthetic hand model maps
    // an input extension onto a measured one.
    const tight = calibratedProfile({ point: POINT }, [0.05, 0.05, 0.05, 0.05, 0.05]);
    const loose = calibratedProfile({ point: POINT }, [0.3, 0.3, 0.3, 0.3, 0.3]);

    /** Largest uniform drift still recognised under this profile. */
    const tolerance = (profile: typeof DEFAULT_PROFILE): number => {
      let best = 0;
      for (let d = 0.02; d <= 0.9; d += 0.02) {
        const drifted = POINT.map((v) => Math.max(0, Math.min(1, v - d)));
        if (feed(new GestureEngine(profile), drifted).action === "draw") best = d;
        else break;
      }
      return best;
    };

    expect(tolerance(loose)).toBeGreaterThan(tolerance(tight));
  });

  it("reports no action when the hand disappears", () => {
    const profile = calibratedProfile({ point: POINT });
    const engine = new GestureEngine(profile);
    feed(engine, POINT);
    const lost = engine.update([], 1000);
    expect(lost.lost).toBe(true);
    expect(lost.action).toBe("none");
  });
});
