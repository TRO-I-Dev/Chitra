/**
 * Adaptive reach mapping.
 *
 * The single worst failure mode in mid-air pointing is a mismatch between the
 * region of the camera frame the user actually moves through and the region
 * the app maps onto the board. Get it wrong and the cursor either covers a
 * fraction of the canvas or spends its life pinned against a clamp — which
 * users read, correctly, as "the cursor doesn't move".
 *
 * A fixed default can't be right: it depends on how far away someone sits, how
 * long their arms are, the camera's field of view, and whether they're at a
 * desk or standing at a wall display. So instead of guessing once, this learns
 * the reach envelope from the user's own movement, continuously.
 *
 * Design constraints that shape the implementation:
 *
 * - **Expand fast, contract slowly.** Reaching somewhere new must work on the
 *   first try, so the envelope grows immediately. Shrinking is the dangerous
 *   direction — it silently increases gain, so it decays over tens of seconds.
 * - **Never let the span collapse.** A hand held still would otherwise drive
 *   the span toward zero and the gain toward infinity, making the cursor
 *   explode at the first twitch. A floor prevents that outright.
 * - **Start from something sane.** Until enough of the envelope is observed,
 *   it blends with the configured area so the very first seconds still work.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest usable span, as a fraction of the frame. */
const MIN_SPAN = 0.16;
/** Padding added around the observed envelope so the edges are comfortable. */
const PAD = 0.04;
/** Samples before the learned envelope is trusted on its own. */
const WARMUP = 45;
/** Per-frame contraction rate — ~40s to forget an outlier at 60fps. */
const CONTRACT = 0.0004;

export class AdaptiveArea {
  private minX = Number.POSITIVE_INFINITY;
  private maxX = Number.NEGATIVE_INFINITY;
  private minY = Number.POSITIVE_INFINITY;
  private maxY = Number.NEGATIVE_INFINITY;
  private samples = 0;

  /** Drop everything learned — "reset reach" in settings, or a camera swap. */
  reset(): void {
    this.minX = Number.POSITIVE_INFINITY;
    this.maxX = Number.NEGATIVE_INFINITY;
    this.minY = Number.POSITIVE_INFINITY;
    this.maxY = Number.NEGATIVE_INFINITY;
    this.samples = 0;
  }

  get ready(): boolean {
    return this.samples >= WARMUP;
  }

  /** Feed one raw pointer sample in normalised camera space. */
  observe(p: { x: number; y: number }): void {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

    if (this.samples === 0) {
      this.minX = this.maxX = p.x;
      this.minY = this.maxY = p.y;
    } else {
      // Grow immediately in the direction of travel…
      this.minX = Math.min(this.minX, p.x);
      this.maxX = Math.max(this.maxX, p.x);
      this.minY = Math.min(this.minY, p.y);
      this.maxY = Math.max(this.maxY, p.y);

      // …and creep back toward the current point everywhere else, so a single
      // wild frame (a mis-detection on a face or a passing hand) doesn't widen
      // the envelope forever.
      this.minX += (p.x - this.minX) * CONTRACT;
      this.maxX += (p.x - this.maxX) * CONTRACT;
      this.minY += (p.y - this.minY) * CONTRACT;
      this.maxY += (p.y - this.maxY) * CONTRACT;
    }
    this.samples++;
  }

  /**
   * The rectangle to map onto the board.
   *
   * @param fallback the configured/calibrated area, used before warm-up and
   *                 blended with the learned envelope during it.
   */
  rect(fallback: Rect): Rect {
    if (this.samples === 0) return fallback;

    const observed = this.padded();
    if (this.samples >= WARMUP) return observed;

    // Blend in over the warm-up so the cursor doesn't visibly jump the moment
    // the learned envelope takes over.
    const t = this.samples / WARMUP;
    return {
      x: fallback.x + (observed.x - fallback.x) * t,
      y: fallback.y + (observed.y - fallback.y) * t,
      w: fallback.w + (observed.w - fallback.w) * t,
      h: fallback.h + (observed.h - fallback.h) * t,
    };
  }

  private padded(): Rect {
    let x0 = this.minX - PAD;
    let x1 = this.maxX + PAD;
    let y0 = this.minY - PAD;
    let y1 = this.maxY + PAD;

    // Enforce the minimum span about the midpoint, so a still hand can't drive
    // the gain to infinity.
    const fix = (a: number, b: number): [number, number] => {
      const span = b - a;
      if (span >= MIN_SPAN) return [a, b];
      const mid = (a + b) / 2;
      return [mid - MIN_SPAN / 2, mid + MIN_SPAN / 2];
    };
    [x0, x1] = fix(x0, x1);
    [y0, y1] = fix(y0, y1);

    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}
