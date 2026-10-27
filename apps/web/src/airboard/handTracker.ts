/**
 * Camera + MediaPipe HandLandmarker lifecycle.
 *
 * Everything is served from `public/mediapipe/` rather than the jsDelivr CDN
 * the MediaPipe docs use: Chitra is local-first and offline-capable, and the
 * desktop shell ships a CSP with no third-party `script-src`. The WASM runtime
 * (~11 MB) and the float16 hand model (~7.8 MB) are loaded lazily, only once
 * the user actually opens Air Board.
 *
 * The detector runs on the render thread inside `requestVideoFrameCallback`
 * (falling back to rAF). Landmarking a 640×480 frame costs ~4-8 ms on the GPU
 * delegate, so this comfortably holds 30-60 fps without a worker — and keeping
 * it on-thread avoids a frame of latency from transferring ImageBitmaps.
 */

import type {
  FilesetResolver as FilesetResolverType,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import { ensureCameraAccess } from "../platform/desktopBridge.js";
import type { DetectedHand } from "./gestureEngine.js";
import type { Landmark } from "./landmarks.js";

/** Frames with no hand before dropping to the idle detection cadence. */
const IDLE_AFTER_EMPTY_FRAMES = 15;
/** Camera frames skipped between detections while idling. */
const IDLE_FRAME_SKIP = 2;

const WASM_PATH = new URL("mediapipe/wasm", document.baseURI).href;
const MODEL_PATH = new URL("mediapipe/models/hand_landmarker.task", document.baseURI).href;

export type TrackerPhase = "idle" | "requesting-camera" | "loading-model" | "running" | "error";

export interface TrackerStatus {
  phase: TrackerPhase;
  message?: string;
  /** Rolling detector FPS, for the HUD. */
  fps: number;
  /** Milliseconds spent inside `detectForVideo` last frame. */
  inferenceMs: number;
  /**
   * The resolution the camera actually negotiated.
   *
   * `getUserMedia` constraints are a *hint* — a camera is free to hand back a
   * different mode — so the requested size proves nothing. Surfacing what was
   * really granted makes the cost visible instead of assumed.
   */
  resolution?: { w: number; h: number };
}

export interface TrackerOptions {
  /** Called every camera frame with whatever hands were detected. */
  onFrame: (hands: DetectedHand[], timestampMs: number) => void;
  onStatus: (status: TrackerStatus) => void;
  /** Camera device to open; omit for the system default. */
  deviceId?: string;
  /** Detect up to this many hands. Two enables the bimanual zoom gesture. */
  numHands?: number;
}

/** Human-readable reasons for the common getUserMedia failures. */
function describeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was denied. Allow the camera for Chitra, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Connect a webcam and try again.";
    case "NotReadableError":
      return "The camera is already in use by another app. Close it and try again.";
    case "AbortError":
      return "The camera stopped unexpectedly. Try again.";
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;
  private rafId: number | null = null;
  private vfcHandle: number | null = null;
  private lastVideoTime = -1;
  private frameTimes: number[] = [];
  private status: TrackerStatus = { phase: "idle", fps: 0, inferenceMs: 0 };
  /** Consecutive frames with no hand found — drives the idle cadence. */
  private emptyStreak = 0;
  /** Camera frames skipped since the last detection, while idling. */
  private skipped = 0;
  private negotiated: { w: number; h: number } | undefined;

  constructor(private opts: TrackerOptions) {}

  /** The `<video>` element the camera stream is attached to (for the preview). */
  get videoElement(): HTMLVideoElement | null {
    return this.video;
  }

  get phase(): TrackerPhase {
    return this.status.phase;
  }

  private setStatus(patch: Partial<TrackerStatus>): void {
    this.status = { ...this.status, ...patch };
    this.opts.onStatus(this.status);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.setStatus({ phase: "requesting-camera", message: "Waking the camera…" });
      await this.openCamera();
      if (!this.running) return; // stopped while awaiting

      this.setStatus({ phase: "loading-model", message: "Loading the vision model…" });
      await this.loadModel();
      if (!this.running) return;

      this.setStatus({
        phase: "running",
        message: undefined,
        ...(this.negotiated ? { resolution: this.negotiated } : {}),
      });
      this.scheduleNextFrame();
    } catch (err) {
      this.running = false;
      this.teardownCamera();
      this.setStatus({ phase: "error", message: describeCameraError(err) });
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.vfcHandle !== null && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.vfcHandle);
      this.vfcHandle = null;
    }
    this.teardownCamera();
    // Keep the landmarker alive — reopening Air Board should be instant, and
    // the model is the expensive part. `dispose()` frees it for good.
    this.setStatus({ phase: "idle", message: undefined, fps: 0, inferenceMs: 0 });
  }

  /** Release the WASM graph too. Call when the app is done with Air Board. */
  dispose(): void {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }

  /** Enumerate cameras. Labels are only populated after permission is granted. */
  static async listCameras(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  private async openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This browser has no camera API. Air Board needs a Chromium-based browser or the Chitra desktop app.",
      );
    }
    // macOS gates the camera behind a system prompt that Electron can only
    // raise from the main process. No-op on the web and on other platforms.
    if (!(await ensureCameraAccess())) {
      throw new Error(
        "Camera access is blocked by the operating system. Enable it for Chitra in your privacy settings, then try again.",
      );
    }
    // 640×480 rather than 720p. The landmark model works on a ~224px crop, so
    // source resolution mostly affects the palm *detector*, which is more than
    // happy at VGA for a hand at desk distance. Dropping it cuts the decode
    // and the per-frame GPU upload to roughly a quarter for no accuracy change
    // that shows up in the cursor.
    const video: MediaTrackConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 60, min: 24 },
      ...(this.opts.deviceId ? { deviceId: { exact: this.opts.deviceId } } : {}),
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const settings = this.stream.getVideoTracks()[0]?.getSettings();
    if (settings?.width && settings?.height) {
      this.negotiated = { w: settings.width, h: settings.height };
    }

    const el = document.createElement("video");
    el.autoplay = true;
    el.playsInline = true;
    el.muted = true;
    el.srcObject = this.stream;
    this.video = el;

    await new Promise<void>((resolve, reject) => {
      const done = (): void => {
        el.removeEventListener("loadeddata", done);
        el.removeEventListener("error", fail);
        resolve();
      };
      const fail = (): void => {
        el.removeEventListener("loadeddata", done);
        el.removeEventListener("error", fail);
        reject(new Error("The camera stream could not be decoded."));
      };
      el.addEventListener("loadeddata", done);
      el.addEventListener("error", fail);
    });
    await el.play();
  }

  private teardownCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.lastVideoTime = -1;
    this.frameTimes = [];
    this.emptyStreak = 0;
    this.skipped = 0;
  }

  private async loadModel(): Promise<void> {
    if (this.landmarker) return;
    // Dynamic import keeps the ~250 KB MediaPipe glue out of the main bundle.
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await (FilesetResolver as typeof FilesetResolverType).forVisionTasks(WASM_PATH);
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: this.opts.numHands ?? 2,
        // Detection is the expensive stage; keep its bar high so we don't
        // latch onto faces/backgrounds, but let tracking coast at a lower
        // bar so a hand isn't dropped mid-stroke when it turns edge-on.
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.45,
      });
    } catch (err) {
      // Some Linux/VM setups advertise WebGL but fail to create the GPU
      // delegate. CPU is ~3× slower but still usable, so degrade instead
      // of refusing to start.
      console.warn("[airboard] GPU delegate unavailable, falling back to CPU:", err);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: this.opts.numHands ?? 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.45,
      });
    }
  }

  /**
   * Prefer `requestVideoFrameCallback` — it fires once per *decoded camera
   * frame* rather than once per display refresh, so on a 144 Hz monitor with a
   * 30 fps webcam we run the detector 30 times a second instead of 144.
   */
  private scheduleNextFrame(): void {
    if (!this.running || !this.video) return;
    const v = this.video;
    if (typeof v.requestVideoFrameCallback === "function") {
      this.vfcHandle = v.requestVideoFrameCallback(() => {
        this.tick();
        this.scheduleNextFrame();
      });
    } else {
      this.rafId = requestAnimationFrame(() => {
        this.tick();
        this.scheduleNextFrame();
      });
    }
  }

  private tick(): void {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!this.running || !video || !landmarker) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    // Feeding the same frame twice makes MediaPipe throw on the monotonic
    // timestamp check, so skip repeats.
    if (video.currentTime === this.lastVideoTime) return;

    /*
     * Adaptive cadence.
     *
     * Inference is ~19ms per frame — at 30fps that is more than half the main
     * thread, spent continuously whether or not anyone is using it. Most of
     * that is wasted: the common idle state is "hand out of frame", where all
     * we need is to notice a hand *arriving*.
     *
     * So once the hand has been gone for half a second, detect on every third
     * frame (~10fps). Latency to first detection rises to ~100ms, which is
     * imperceptible against the time it takes to raise a hand, and idle cost
     * drops to a third. Full rate resumes on the very first detection.
     */
    if (this.emptyStreak > IDLE_AFTER_EMPTY_FRAMES && this.skipped < IDLE_FRAME_SKIP) {
      this.skipped++;
      return;
    }
    this.skipped = 0;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    let hands: DetectedHand[] = [];
    try {
      const result = landmarker.detectForVideo(video, now);
      const handedness = result.handedness ?? [];
      hands = (result.landmarks ?? []).map((lms, i) => ({
        landmarks: lms as readonly Landmark[],
        handedness: handedness[i]?.[0]?.categoryName ?? "Right",
        score: handedness[i]?.[0]?.score ?? 0,
      }));
    } catch (err) {
      // A single bad frame (camera hiccup, GPU context loss) shouldn't kill
      // the session — log once per second at most and keep going.
      if (this.frameTimes.length % 30 === 0) {
        console.warn("[airboard] detection frame failed:", err);
      }
    }
    const inferenceMs = performance.now() - now;
    // Reset to full rate the instant a hand appears.
    this.emptyStreak = hands.length > 0 ? 0 : this.emptyStreak + 1;

    this.frameTimes.push(now);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    const span =
      this.frameTimes.length > 1
        ? this.frameTimes[this.frameTimes.length - 1]! - this.frameTimes[0]!
        : 0;
    const fps = span > 0 ? ((this.frameTimes.length - 1) / span) * 1000 : 0;

    if (Math.abs(fps - this.status.fps) > 1.5 || this.status.phase !== "running") {
      this.setStatus({ phase: "running", fps: Math.round(fps), inferenceMs });
    } else {
      this.status = { ...this.status, inferenceMs };
    }

    this.opts.onFrame(hands, now);
  }
}
