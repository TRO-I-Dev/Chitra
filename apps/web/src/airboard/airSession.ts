/**
 * Air Board session — the runtime that binds camera → gestures → ink.
 *
 * Deliberately not a React hook. A hand tracker produces 30-60 frames a second
 * and every frame moves a cursor; routing that through React state would spend
 * the entire frame budget on reconciliation. Instead the session owns an
 * imperative canvas and paints the cursor, the live stroke and the HUD ring
 * directly, and only calls back into React when something *discrete* happens
 * (tool changed, shape recognised, status changed, card requested).
 */

import type { AirTool } from "./airBoardStore.js";
import {
  type InkStyle,
  elementForShape,
  makeArrow,
  makeDiamond,
  makeEllipse,
  makeLine,
  makeRectangle,
} from "./excalidrawFactory.js";
import { type AirFrame, type DetectedHand, GestureEngine } from "./gestureEngine.js";
import type { GestureProfile } from "./gestureProfile.js";
import { HandTracker, type TrackerStatus } from "./handTracker.js";
import { HAND_CONNECTIONS, type Landmark } from "./landmarks.js";
import {
  appendElements,
  deleteElements,
  elementsNear,
  panScene,
  sceneZoom,
  viewportToScene,
} from "./sketchBridge.js";
import { type Box, type Pt, type ShapeKind, recognizeShape } from "./strokeShaper.js";

export interface AirSessionCallbacks {
  onStatus: (status: TrackerStatus) => void;
  /** A stroke was committed; `kind` is what it was recognised as. */
  onShape: (kind: ShapeKind, why: string, confidence: number) => void;
  /** The tool ring should open / close. */
  onRing: (open: boolean) => void;
  /** Dwell landed on a ring slot (index into the ring's item list). */
  onRingPick: (index: number) => void;
  /** Card tool finished a drag — ask the user for a title. */
  onCardRequest: (box: Box, pageBox: Box) => void;
  /** Live action label for the HUD; fires only on change. */
  onAction: (action: string) => void;
  /** Hand visibility changed. */
  onPresence: (visible: boolean) => void;
}

export interface AirSessionConfig {
  profile: GestureProfile;
  tool: AirTool;
  style: InkStyle;
  ringOpen: boolean;
  ringSlots: number;
  previewOn: boolean;
  cameraId: string | null;
  /** Suppress ink entirely — used while a modal (calibration) is up. */
  paused: boolean;
}

/** A point plus the time it was sampled, so we can fade the laser trail. */
interface TrailPoint extends Pt {
  t: number;
}

const TRAIL_MS = 620;
/** Live-stroke point budget before the older half is decimated. */
const MAX_LIVE_POINTS = 1200;

export class AirSession {
  private tracker: HandTracker | null = null;
  private engine: GestureEngine;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;

  private cfg: AirSessionConfig;
  private readonly cb: AirSessionCallbacks;

  /** Current stroke in page-space px. */
  private stroke: Pt[] = [];
  private strokeActive = false;
  private strokeAnchor: Pt | null = null;
  private trail: TrailPoint[] = [];
  private lastFrame: AirFrame | null = null;
  private lastAction = "none";
  private lastPresence = false;
  private panFrom: Pt | null = null;
  private erasedThisSweep = new Set<string>();
  /** Batches of committed element ids, newest last — powers gesture undo. */
  private undoStack: string[][] = [];
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /**
   * Cached canvas box. `getBoundingClientRect()` forces a layout flush, and the
   * old code called it three or four times per frame at 60-144fps. The overlay
   * is `position: fixed`, so the box only changes when the viewport does — and
   * the ResizeObserver tells us exactly when that is.
   */
  private cachedRect: DOMRect | null = null;
  private lastPreviewAt = 0;
  /** True while the canvas holds something that still needs clearing. */
  private dirty = false;
  /* Cursor interpolation between detections — see `onFrame`. */
  private renderCursor: Pt | null = null;
  private renderFrom: Pt | null = null;
  private renderTo: Pt | null = null;
  private renderSpanStart = 0;
  private renderSpanMs = 16;
  private lastDetectAt = 0;

  /* --- tool ring state machine (open palm → browse, fist → choose) --- */
  /** Wedge under the cursor right now, or -1 for the centre dead zone. */
  private ringHoverIndex = -1;
  /** Wedge latched when the hand began closing. -1 = not latched yet. */
  private ringLatchedIndex = -1;
  /** The palm has been open enough to browse at least once this session. */
  private ringArmed = false;
  /** When the hand went missing while the ring was open. */
  private ringLostSince: number | null = null;
  /** Menu gesture is ignored until this timestamp (see `closeRing`). */
  private ringCooldownUntil = 0;

  constructor(cfg: AirSessionConfig, cb: AirSessionCallbacks) {
    this.cfg = cfg;
    this.cb = cb;
    this.engine = new GestureEngine(cfg.profile);
    currentSession = this;
  }

  /* ---------------- lifecycle ---------------- */

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d") ?? null;
    this.resize();
    if (!canvas) return;
    // A window-resize listener alone is not enough: the canvas is also resized
    // by layout the overlay doesn't control (sidebar collapsing, the window
    // being restored, the initial mount happening before layout settles). When
    // the backing store disagrees with the CSS box, everything is drawn into
    // the wrong sub-rectangle — which looks exactly like a cursor that only
    // covers part of the screen.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  attachPreview(canvas: HTMLCanvasElement | null): void {
    this.previewCanvas = canvas;
  }

  get video(): HTMLVideoElement | null {
    return this.tracker?.videoElement ?? null;
  }

  async start(): Promise<void> {
    if (this.tracker) return;
    this.tracker = new HandTracker({
      onFrame: (hands, t) => this.onFrame(hands, t),
      onStatus: (s) => this.cb.onStatus(s),
      numHands: 1,
      ...(this.cfg.cameraId ? { deviceId: this.cfg.cameraId } : {}),
    });
    await this.tracker.start();
    this.startRenderLoop();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.tracker?.dispose();
    this.tracker = null;
    this.engine.reset();
    this.stroke = [];
    this.strokeActive = false;
    this.trail = [];
    this.lastFrame = null;
    this.renderCursor = null;
    this.renderFrom = null;
    this.renderTo = null;
    this.lastDetectAt = 0;
    this.clear();
    if (currentSession === this) currentSession = null;
  }

  /** Swap camera without tearing down the model. */
  async setCamera(deviceId: string | null): Promise<void> {
    this.cfg = { ...this.cfg, cameraId: deviceId };
    if (!this.tracker) return;
    this.stop();
    await this.start();
  }

  update(patch: Partial<AirSessionConfig>): void {
    const prevProfile = this.cfg.profile;
    this.cfg = { ...this.cfg, ...patch };
    if (patch.profile && patch.profile !== prevProfile) {
      this.engine.applyProfile(patch.profile);
    }
    // Changing tool mid-stroke would commit the wrong primitive.
    if (patch.tool && this.strokeActive) this.abortStroke();
  }

  resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    // Assigning width/height clears the canvas, so skip it when nothing moved.
    this.cachedRect = rect;
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext("2d");
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** The canvas box, from cache. Falls back to a live measure if unseeded. */
  private rect(): DOMRect | null {
    if (this.cachedRect) return this.cachedRect;
    const r = this.canvas?.getBoundingClientRect() ?? null;
    this.cachedRect = r;
    return r;
  }

  /* ---------------- frame handling ---------------- */

  private onFrame(hands: DetectedHand[], t: number): void {
    const frame = this.engine.update(hands, t);
    // Detection runs at camera rate (~30fps) but we paint at display rate
    // (60-144fps). Without interpolation the cursor visibly steps; with it,
    // the same detections read as smooth motion at no extra inference cost.
    this.renderFrom = this.renderCursor ?? frame.cursor;
    this.renderTo = frame.cursor;
    this.renderSpanStart = performance.now();
    this.renderSpanMs = this.lastDetectAt ? Math.min(t - this.lastDetectAt, 60) : 16;
    this.lastDetectAt = t;
    this.lastFrame = frame;

    if (frame.lost !== !this.lastPresence) {
      this.lastPresence = !frame.lost;
      this.cb.onPresence(!frame.lost);
    }
    if (frame.action !== this.lastAction) {
      this.lastAction = frame.action;
      this.cb.onAction(frame.action);
    }

    if (this.cfg.paused) return;

    const page = this.toPage(frame.cursor);
    this.pushTrail(page, t);

    /* --- tool ring takes priority: while it's open, the cursor picks --- */
    if (this.cfg.ringOpen) {
      this.handleRing(frame, page, t);
      return;
    }

    switch (frame.action) {
      case "draw":
        this.handleDraw(frame, page);
        break;
      case "erase":
        this.handleErase(page);
        break;
      case "pan":
        this.handlePan(page, frame);
        break;
      case "menu":
        if (frame.actionStarted && t >= this.ringCooldownUntil) this.openRing();
        break;
      case "undo":
        if (frame.actionStarted) this.undoLast();
        break;
      case "commit":
        if (frame.actionStarted && this.strokeActive) this.endStroke(true);
        break;
      default:
        break;
    }

    // Any action other than the one that owns the stroke ends it cleanly.
    if (this.strokeActive && frame.action !== "draw") this.endStroke(false);
    if (frame.action !== "erase") this.erasedThisSweep.clear();
    if (frame.action !== "pan") this.panFrom = null;
  }

  /* ---------------- actions ---------------- */

  private handleDraw(frame: AirFrame, page: Pt): void {
    if (this.cfg.tool === "laser") return;
    if (this.cfg.tool === "eraser") {
      this.handleErase(page);
      return;
    }
    if (frame.actionStarted) {
      this.stroke = [page];
      this.strokeAnchor = page;
      this.strokeActive = true;
      return;
    }
    if (!this.strokeActive) return;
    const last = this.stroke[this.stroke.length - 1];
    // Drop sub-pixel repeats; they only inflate the point count.
    if (!last || Math.hypot(page.x - last.x, page.y - last.y) > 1.1) this.stroke.push(page);
    // A very long stroke would be re-pathed in full every frame. Halving the
    // resolution of the older half keeps the live preview cost bounded without
    // touching the shape that eventually gets committed in any visible way.
    if (this.stroke.length > MAX_LIVE_POINTS) {
      const head = this.stroke.slice(0, this.stroke.length >> 1).filter((_, i) => i % 2 === 0);
      this.stroke = [...head, ...this.stroke.slice(this.stroke.length >> 1)];
    }
  }

  private handleErase(page: Pt): void {
    const scene = viewportToScene(page);
    const radius = 26 / Math.max(sceneZoom(), 0.05);
    const hits = elementsNear(scene, radius).filter((id) => !this.erasedThisSweep.has(id));
    if (hits.length === 0) return;
    for (const id of hits) this.erasedThisSweep.add(id);
    deleteElements(hits);
  }

  private handlePan(page: Pt, frame: AirFrame): void {
    if (frame.actionStarted || !this.panFrom) {
      this.panFrom = page;
      return;
    }
    panScene(page.x - this.panFrom.x, page.y - this.panFrom.y);
    this.panFrom = page;
  }

  private openRing(): void {
    this.ringHoverIndex = -1;
    this.ringLatchedIndex = -1;
    this.ringArmed = false;
    this.ringLostSince = null;
    // Note: a stroke in progress is deliberately *not* aborted here. The
    // caller's post-switch cleanup commits it, because opening a palm to reach
    // the menu should keep the line you just drew, not throw it away.
    this.cb.onRing(true);
  }

  private closeRing(pick: number | null, t: number): void {
    if (pick !== null && pick >= 0) this.cb.onRingPick(pick);
    this.ringHoverIndex = -1;
    this.ringLatchedIndex = -1;
    this.ringArmed = false;
    this.ringLostSince = null;
    // Choosing ends on a fist, and the natural next motion is to relax the
    // hand — which is an open palm, which would instantly re-open the ring.
    // Hold the menu gesture off briefly so a selection actually sticks.
    this.ringCooldownUntil = t + 1200;
    this.cb.onRing(false);
  }

  /**
   * Tool ring interaction: **open palm browses, closing fist chooses.**
   *
   * The subtlety that makes this work is the latch. Closing a hand into a fist
   * drags the fingertip several centimetres — easily a whole wedge — so if the
   * selection tracked the cursor right up to the moment the fist registers,
   * users would reliably get the tool *next to* the one they aimed at. So the
   * highlight follows the cursor only while the palm is genuinely open; the
   * instant the hand starts closing, the choice latches and stops moving. Open
   * the hand again and it unlatches, so a mistake is trivially correctable.
   */
  private handleRing(frame: AirFrame, page: Pt, t: number): void {
    const rect = this.rect();
    if (!rect) return;

    // A hand that leaves the frame shouldn't strand the ring open forever, but
    // a single dropped detection shouldn't dismiss it either.
    if (frame.lost) {
      if (this.ringLostSince === null) this.ringLostSince = t;
      else if (t - this.ringLostSince > 1500) this.closeRing(null, t);
      return;
    }
    this.ringLostSince = null;

    const slots = Math.max(this.cfg.ringSlots, 1);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = page.x - cx;
    const dy = page.y - cy;
    const r = Math.hypot(dx, dy);

    const scrubAt = this.cfg.profile.ringScrubOpenness;
    const latchAt = this.cfg.profile.ringLatchOpenness;

    if (frame.openness >= scrubAt) {
      // Palm open: browse freely, and drop any previous latch so the user can
      // change their mind just by opening up again.
      this.ringArmed = true;
      this.ringLatchedIndex = -1;
      // Inside the dead zone the ring hovers nothing, so a shaky hand near the
      // centre can't cycle wildly through every tool.
      if (r < 70) {
        this.ringHoverIndex = -1;
      } else {
        // −90° puts slot 0 at the top; the half-wedge offset centres each
        // wedge on its icon. `ToolRing` lays the icons out with the same maths.
        const angle = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / slots;
        const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        this.ringHoverIndex = Math.floor((norm / (Math.PI * 2)) * slots) % slots;
      }
    } else if (this.ringArmed && frame.openness <= latchAt && this.ringLatchedIndex < 0) {
      // Hand is closing — freeze whatever was highlighted.
      this.ringLatchedIndex = this.ringHoverIndex;
    }

    const target = this.ringLatchedIndex >= 0 ? this.ringLatchedIndex : this.ringHoverIndex;

    // Fist confirms. Dwell stays as an accessibility fallback for anyone who
    // can't close their hand fully enough to register a fist.
    const confirmed = (frame.action === "select" && frame.actionStarted) || frame.dwellFired;
    if (confirmed && target >= 0) {
      this.closeRing(target, t);
    }
  }

  private abortStroke(): void {
    this.stroke = [];
    this.strokeActive = false;
    this.strokeAnchor = null;
  }

  /**
   * Finish the current stroke and commit it.
   * @param forceShape true when the user explicitly asked for shape snapping
   *                   via the "commit" gesture, which overrides the slider.
   */
  private endStroke(forceShape: boolean): void {
    const pts = this.stroke;
    this.strokeActive = false;
    this.stroke = [];
    const anchor = this.strokeAnchor;
    this.strokeAnchor = null;
    if (pts.length < 2) return;

    const tool = this.cfg.tool;
    const style = this.cfg.style;

    /* --- explicit primitive tools: rubber-band from anchor to release --- */
    if (anchor && isPrimitiveTool(tool)) {
      const end = pts[pts.length - 1]!;
      const el = this.primitiveElement(tool, anchor, end, style);
      if (el) {
        const ids = appendElements([el]);
        if (ids.length > 0) this.undoStack.push(ids);
        this.cb.onShape(toolShapeKind(tool), "Drawn with the shape tool", 1);
      }
      return;
    }

    /* --- card tool: hand the box back to React for a title --- */
    if (tool === "card" && anchor) {
      const end = pts[pts.length - 1]!;
      const pageBox = normaliseBox(anchor, end);
      if (pageBox.w < 24 || pageBox.h < 18) return;
      this.cb.onCardRequest(this.sceneBox(pageBox), pageBox);
      return;
    }

    /* --- pen / marker: recognise, then commit --- */
    const scenePts = pts.map((p) => viewportToScene(p));
    const strength = forceShape
      ? Math.max(this.cfg.profile.shapeSnapStrength, 0.85)
      : this.cfg.profile.shapeSnap
        ? this.cfg.profile.shapeSnapStrength
        : 0;
    const result = recognizeShape(scenePts, strength);
    const el = elementForShape(result.kind, result.box, result.points, style);
    const ids = appendElements([el]);
    if (ids.length > 0) this.undoStack.push(ids);
    this.cb.onShape(result.kind, result.why, result.confidence);
  }

  private primitiveElement(
    tool: AirTool,
    a: Pt,
    b: Pt,
    style: InkStyle,
  ): Record<string, unknown> | null {
    const sa = viewportToScene(a);
    const sb = viewportToScene(b);
    const box = normaliseBox(sa, sb);
    if (box.w < 4 && box.h < 4) return null;
    switch (tool) {
      case "rectangle":
        return makeRectangle(box, style);
      case "ellipse":
        return makeEllipse(box, style);
      case "diamond":
        return makeDiamond(box, style);
      case "arrow":
        return makeArrow([sa, sb], style);
      case "line":
        return makeLine([sa, sb], style);
      default:
        return null;
    }
  }

  /** Forget the learned reach envelope and start relearning it. */
  resetReach(): void {
    this.engine.resetReach();
  }

  /** Delete the most recent batch this session committed. */
  undoLast(): boolean {
    const batch = this.undoStack.pop();
    if (!batch || batch.length === 0) return false;
    deleteElements(batch);
    return true;
  }

  /** Called by React once the user names an air-drawn card. */
  registerCommitted(ids: readonly string[]): void {
    if (ids.length > 0) this.undoStack.push([...ids]);
  }

  /* ---------------- rendering ---------------- */

  private startRenderLoop(): void {
    const draw = (): void => {
      this.render();
      this.rafId = requestAnimationFrame(draw);
    };
    this.rafId = requestAnimationFrame(draw);
  }

  private clear(): void {
    const ctx = this.ctx;
    const rect = this.rect();
    if (!ctx || !rect) return;
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  private render(): void {
    const ctx = this.ctx;
    const rect = this.rect();
    if (!ctx || !rect) return;

    const frame = this.lastFrame;
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS);

    // Nothing on screen and nothing to put there: don't clear an already-clear
    // 1783×1047 buffer 144 times a second. This is the common case any time the
    // user's hand is out of frame. The camera thumbnail still updates, so the
    // HUD keeps showing live video while the ink layer sits idle.
    const nothingToDraw = (!frame || frame.lost) && this.trail.length === 0 && !this.strokeActive;
    if (nothingToDraw) {
      if (this.dirty) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        this.dirty = false;
      }
      this.drawPreview();
      return;
    }
    this.dirty = true;
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Live stroke — drawn in local canvas space.
    if (this.strokeActive && this.stroke.length > 1) {
      if (isPrimitiveTool(this.cfg.tool) && this.strokeAnchor) {
        this.drawPrimitivePreview(
          ctx,
          rect,
          this.strokeAnchor,
          this.stroke[this.stroke.length - 1]!,
        );
      } else if (this.cfg.tool === "card" && this.strokeAnchor) {
        this.drawCardPreview(ctx, rect, this.strokeAnchor, this.stroke[this.stroke.length - 1]!);
      } else {
        this.drawInk(ctx, rect);
      }
    }

    // Advance the interpolated cursor toward the newest detection.
    if (this.renderFrom && this.renderTo) {
      const k = Math.min(1, (now - this.renderSpanStart) / Math.max(this.renderSpanMs, 1));
      this.renderCursor = {
        x: this.renderFrom.x + (this.renderTo.x - this.renderFrom.x) * k,
        y: this.renderFrom.y + (this.renderTo.y - this.renderFrom.y) * k,
      };
    }

    this.drawTrail(ctx, rect, now);
    if (frame && !frame.lost) {
      this.drawEdgeHints(ctx, rect, frame);
      this.drawCursor(ctx, rect, frame, this.renderCursor ?? frame.cursor);
    }
    this.drawPreview();
  }

  private drawInk(ctx: CanvasRenderingContext2D, rect: DOMRect): void {
    const style = this.cfg.style;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = style.strokeColor;
    ctx.globalAlpha = style.opacity / 100;
    ctx.lineWidth = Math.max(style.strokeWidth * sceneZoom(), 1.5);
    ctx.beginPath();
    const p0 = this.stroke[0]!;
    ctx.moveTo(p0.x - rect.left, p0.y - rect.top);
    for (let i = 1; i < this.stroke.length; i++) {
      const p = this.stroke[i]!;
      ctx.lineTo(p.x - rect.left, p.y - rect.top);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawPrimitivePreview(ctx: CanvasRenderingContext2D, rect: DOMRect, a: Pt, b: Pt): void {
    const style = this.cfg.style;
    const x0 = a.x - rect.left;
    const y0 = a.y - rect.top;
    const x1 = b.x - rect.left;
    const y1 = b.y - rect.top;
    const box = normaliseBox({ x: x0, y: y0 }, { x: x1, y: y1 });
    ctx.save();
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = Math.max(style.strokeWidth * sceneZoom(), 1.5);
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    switch (this.cfg.tool) {
      case "rectangle":
        ctx.rect(box.x, box.y, box.w, box.h);
        break;
      case "ellipse":
        ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
        break;
      case "diamond":
        ctx.moveTo(box.x + box.w / 2, box.y);
        ctx.lineTo(box.x + box.w, box.y + box.h / 2);
        ctx.lineTo(box.x + box.w / 2, box.y + box.h);
        ctx.lineTo(box.x, box.y + box.h / 2);
        ctx.closePath();
        break;
      default:
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        break;
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawCardPreview(ctx: CanvasRenderingContext2D, rect: DOMRect, a: Pt, b: Pt): void {
    const box = normaliseBox(
      { x: a.x - rect.left, y: a.y - rect.top },
      { x: b.x - rect.left, y: b.y - rect.top },
    );
    ctx.save();
    ctx.fillStyle = "rgba(124,140,255,0.14)";
    ctx.strokeStyle = "#7c8cff";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    roundRect(ctx, box.x, box.y, box.w, box.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(231,231,238,0.85)";
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.fillText("New card", box.x + 12, box.y + 22);
    ctx.restore();
  }

  /**
   * The fading cursor trail.
   *
   * Drawn as a handful of banded sub-paths rather than one styled stroke per
   * segment. The old version issued a `beginPath`/`stroke` pair — and set
   * `globalAlpha`, `strokeStyle` and `lineWidth` — for each of up to 160
   * segments, every frame, at up to 144fps. That is ~23k state changes and
   * draw calls a second for a decorative trail. Quantising age into a few
   * bands collapses it to one path per band with no visible difference.
   */
  private drawTrail(ctx: CanvasRenderingContext2D, rect: DOMRect, now: number): void {
    if (this.trail.length < 2) return;
    const laser = this.cfg.tool === "laser";
    const peak = laser ? 0.9 : 0.24;
    const baseWidth = laser ? 5 : 2.5;
    const colour = laser ? "#ff5470" : this.cfg.style.strokeColor;
    const BANDS = 6;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colour;

    // Bucket segments by age band, oldest band first so newer ink lands on top.
    const bands: Pt[][][] = Array.from({ length: BANDS }, () => []);
    let run: Pt[] | null = null;
    let runBand = -1;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const age = (now - b.t) / TRAIL_MS;
      if (age >= 1) {
        run = null;
        runBand = -1;
        continue;
      }
      const band = Math.min(BANDS - 1, Math.floor(age * BANDS));
      if (band !== runBand || !run) {
        run = [a, b];
        bands[band]!.push(run);
        runBand = band;
      } else {
        run.push(b);
      }
    }

    for (let band = BANDS - 1; band >= 0; band--) {
      const runs = bands[band]!;
      if (runs.length === 0) continue;
      const age = (band + 0.5) / BANDS;
      const alpha = (1 - age) * peak;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = baseWidth * (1 - age * 0.6);
      ctx.beginPath();
      for (const pts of runs) {
        ctx.moveTo(pts[0]!.x - rect.left, pts[0]!.y - rect.top);
        for (let k = 1; k < pts.length; k++) {
          ctx.lineTo(pts[k]!.x - rect.left, pts[k]!.y - rect.top);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Glow along whichever edge the cursor is pinned against.
   *
   * Without this, running out of reach is indistinguishable from the tracker
   * having died — the cursor simply stops. The glow says "keep moving that
   * way and I'll follow", which is also the gesture that teaches the adaptive
   * reach envelope to grow.
   */
  private drawEdgeHints(ctx: CanvasRenderingContext2D, rect: DOMRect, frame: AirFrame): void {
    const { x: ex, y: ey } = frame.edge;
    if (ex === 0 && ey === 0) return;

    const BAND = 26;
    const STRONG = "rgba(255,180,77,0.5)";
    const FADE = "rgba(255,180,77,0)";
    const { width: w, height: h } = rect;

    ctx.save();
    // Each band fades away from its own edge, so the gradient endpoints are
    // just the edge coordinate and the inward extent.
    const band = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      r: [number, number, number, number],
    ): void => {
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, STRONG);
      grad.addColorStop(1, FADE);
      ctx.fillStyle = grad;
      ctx.fillRect(r[0], r[1], r[2], r[3]);
    };

    if (ex < 0) band(0, 0, BAND, 0, [0, 0, BAND, h]);
    if (ex > 0) band(w, 0, w - BAND, 0, [w - BAND, 0, BAND, h]);
    if (ey < 0) band(0, 0, 0, BAND, [0, 0, w, BAND]);
    if (ey > 0) band(0, h, 0, h - BAND, [0, h - BAND, w, BAND]);
    ctx.restore();
  }

  private drawCursor(ctx: CanvasRenderingContext2D, rect: DOMRect, frame: AirFrame, at: Pt): void {
    const x = at.x * rect.width;
    const y = at.y * rect.height;
    const pinch = frame.pinchAmount;
    const drawing = frame.action === "draw";
    const erasing = frame.action === "erase" || this.cfg.tool === "eraser";

    ctx.save();
    ctx.translate(x, y);

    // Outer ring — contracts as the pinch closes, so the user can *see* how
    // close they are to the pen-down threshold instead of guessing.
    const outer = erasing ? 26 : 22 - pinch * 8;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.strokeStyle = erasing
      ? "rgba(255,107,138,0.9)"
      : drawing
        ? this.cfg.style.strokeColor
        : "rgba(231,231,238,0.55)";
    ctx.lineWidth = drawing ? 2.5 : 1.5;
    ctx.stroke();

    // Dwell progress arc.
    if (frame.dwellProgress > 0.02) {
      ctx.beginPath();
      ctx.arc(0, 0, outer + 6, -Math.PI / 2, -Math.PI / 2 + frame.dwellProgress * Math.PI * 2);
      ctx.strokeStyle = "#37d3d0";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Core dot.
    ctx.beginPath();
    ctx.arc(0, 0, drawing ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = erasing ? "#ff6b8a" : drawing ? this.cfg.style.strokeColor : "#e7e7ee";
    ctx.fill();

    // Crosshair ticks help with precise placement; they'd be noise mid-stroke.
    if (!drawing) {
      ctx.strokeStyle = "rgba(231,231,238,0.35)";
      ctx.lineWidth = 1;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(dx * (outer + 4), dy * (outer + 4));
        ctx.lineTo(dx * (outer + 11), dy * (outer + 11));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Mirror-corrected camera thumbnail with the hand skeleton on top. */
  private drawPreview(): void {
    const canvas = this.previewCanvas;
    const video = this.tracker?.videoElement;
    if (!canvas || !video || !this.cfg.previewOn) return;
    // The thumbnail is 168x126 decoration. Repainting a full video frame into
    // it on every rAF costs real GPU bandwidth for no perceptible gain, so cap
    // it at ~20fps while the cursor keeps running at full rate.
    const now = performance.now();
    if (now - this.lastPreviewAt < 50) return;
    this.lastPreviewAt = now;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.videoWidth === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    if (this.cfg.profile.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    // Cover-fit so the preview isn't letterboxed.
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const lms = this.lastFrame?.landmarks;
    if (lms && lms.length >= 21) {
      this.drawSkeleton(ctx, lms, w, h);
    }
    ctx.restore();

    // Reach rectangle — the learned envelope when auto-reach is on, so the
    // preview shows what's actually being mapped rather than a stale setting.
    const a = this.engine.reachRect;
    ctx.save();
    ctx.strokeStyle = "rgba(124,140,255,0.75)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    const ax = this.cfg.profile.mirror ? 1 - a.x - a.w : a.x;
    ctx.strokeRect(ax * w, a.y * h, a.w * w, a.h * h);
    ctx.restore();
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    lms: readonly Landmark[],
    w: number,
    h: number,
  ): void {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(124,140,255,0.9)";
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = lms[a];
      const pb = lms[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "#37d3d0";
    for (const p of lms) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------- helpers ---------------- */

  /** Normalised board cursor → page-space pixels. */
  private toPage(c: Pt): Pt {
    const rect = this.rect();
    if (!rect) return { x: c.x, y: c.y };
    return { x: rect.left + c.x * rect.width, y: rect.top + c.y * rect.height };
  }

  private pushTrail(p: Pt, t: number): void {
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
    this.trail.push({ ...p, t });
    if (this.trail.length > 160) this.trail.shift();
  }

  private sceneBox(pageBox: Box): Box {
    const a = viewportToScene({ x: pageBox.x, y: pageBox.y });
    const b = viewportToScene({ x: pageBox.x + pageBox.w, y: pageBox.y + pageBox.h });
    return normaliseBox(a, b);
  }

  /** Snapshot for the HUD; safe to read from React on a slow interval. */
  get snapshot(): AirFrame | null {
    return this.lastFrame;
  }

  /**
   * What the ring is currently pointing at, for the React overlay.
   *
   * `latched` is the whole story of the interaction: -1 means the palm is
   * still open and the user is browsing, ≥0 means the hand has begun closing
   * and the choice is frozen pending a fist.
   */
  get ringState(): { hover: number; latched: number; openness: number } {
    return {
      hover: this.ringHoverIndex,
      latched: this.ringLatchedIndex,
      openness: this.lastFrame?.openness ?? 0,
    };
  }
}

/* ------------------------------------------------------------------ */

/**
 * The session that currently owns the camera.
 *
 * The calibration wizard needs a live landmark feed, and opening a second
 * `getUserMedia` stream on the same device is both wasteful and unreliable on
 * Windows. Reading the running session's last frame gives the wizard exactly
 * the same data at zero extra cost.
 */
let currentSession: AirSession | null = null;

export function getActiveSession(): AirSession | null {
  return currentSession;
}

function isPrimitiveTool(tool: AirTool): boolean {
  return (
    tool === "rectangle" ||
    tool === "ellipse" ||
    tool === "diamond" ||
    tool === "arrow" ||
    tool === "line"
  );
}

function toolShapeKind(tool: AirTool): ShapeKind {
  switch (tool) {
    case "rectangle":
      return "rectangle";
    case "ellipse":
      return "ellipse";
    case "diamond":
      return "diamond";
    case "arrow":
      return "arrow";
    case "line":
      return "line";
    default:
      return "freedraw";
  }
}

export function normaliseBox(a: Pt, b: Pt): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
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
