/**
 * 1€ (One Euro) filter — Casiez, Roussel & Vogel, CHI 2012.
 *
 * A speed-adaptive low-pass filter. The cutoff frequency rises linearly with
 * the estimated signal derivative, so a slow-moving hand gets heavy smoothing
 * (kills the ~2-4px landmark jitter MediaPipe emits at rest) while a fast
 * sweep gets almost none (no rubber-banding lag on quick strokes).
 *
 * Tuning, per the paper's own procedure:
 *   1. Set `beta` to 0 and lower `minCutoff` until jitter at rest is gone.
 *   2. Raise `beta` until fast movements no longer lag behind the hand.
 *
 * Our defaults are tuned for a 640×480 webcam at 30-60fps with the cursor
 * expressed in normalised [0,1] image coordinates.
 */

export interface OneEuroOptions {
  /** Cutoff (Hz) at zero velocity. Lower = less jitter, more lag. */
  minCutoff: number;
  /** Velocity coefficient. Higher = less lag when moving fast. */
  beta: number;
  /** Cutoff (Hz) for the derivative estimate itself. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroOptions = {
  minCutoff: 1.2,
  beta: 0.012,
  dCutoff: 1.0,
};

/** Exponential smoothing with an explicit, resettable previous value. */
class LowPass {
  private y: number | null = null;
  private s = 0;

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  get hasValue(): boolean {
    return this.y !== null;
  }

  reset(): void {
    this.y = null;
    this.s = 0;
  }
}

function alphaFor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** Scalar 1€ filter. */
export class OneEuroFilter {
  private readonly xf = new LowPass();
  private readonly dxf = new LowPass();
  private lastTime: number | null = null;
  private lastRaw: number | null = null;

  constructor(private opts: OneEuroOptions = DEFAULT_ONE_EURO) {}

  setOptions(opts: Partial<OneEuroOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** @param t timestamp in milliseconds (monotonic, e.g. `performance.now()`). */
  filter(value: number, t: number): number {
    // First sample, or a timestamp that went backwards (tab restored, camera
    // restarted): seed rather than divide by a bogus dt.
    const dt = this.lastTime === null ? 1 / 60 : Math.max((t - this.lastTime) / 1000, 1e-4);
    this.lastTime = t;

    const dValue = this.lastRaw === null ? 0 : (value - this.lastRaw) / dt;
    this.lastRaw = value;

    const edValue = this.dxf.filter(dValue, alphaFor(this.opts.dCutoff, dt));
    const cutoff = this.opts.minCutoff + this.opts.beta * Math.abs(edValue);
    return this.xf.filter(value, alphaFor(cutoff, dt));
  }

  reset(): void {
    this.xf.reset();
    this.dxf.reset();
    this.lastTime = null;
    this.lastRaw = null;
  }
}

/** 2D convenience wrapper — one independent filter per axis. */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(opts: OneEuroOptions = DEFAULT_ONE_EURO) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }

  setOptions(opts: Partial<OneEuroOptions>): void {
    this.fx.setOptions(opts);
    this.fy.setOptions(opts);
  }

  filter(p: { x: number; y: number }, t: number): { x: number; y: number } {
    return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}

/**
 * Schmitt trigger — binary state with separate rise/fall thresholds.
 *
 * Every pinch/extension decision runs through one of these. A single
 * threshold makes a gesture flicker on/off dozens of times per second when
 * the measurement sits right on the boundary; hysteresis plus a minimum
 * dwell time makes the transition commit exactly once.
 */
export class HysteresisGate {
  private state = false;
  private pendingSince: number | null = null;

  constructor(
    /** Value must fall below this to turn ON (measurements are distances). */
    private onThreshold: number,
    /** Value must rise above this to turn OFF. Must be > onThreshold. */
    private offThreshold: number,
    /** How long (ms) the condition must hold before the state flips. */
    private dwellMs = 40,
  ) {}

  setThresholds(on: number, off: number): void {
    this.onThreshold = on;
    this.offThreshold = off;
  }

  /** @returns the debounced boolean state. */
  update(value: number, t: number): boolean {
    const wants = this.state ? value < this.offThreshold : value < this.onThreshold;
    if (wants === this.state) {
      this.pendingSince = null;
      return this.state;
    }
    if (this.pendingSince === null) this.pendingSince = t;
    if (t - this.pendingSince >= this.dwellMs) {
      this.state = wants;
      this.pendingSince = null;
    }
    return this.state;
  }

  get value(): boolean {
    return this.state;
  }

  reset(): void {
    this.state = false;
    this.pendingSince = null;
  }
}
