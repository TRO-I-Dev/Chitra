import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveSession } from "./airSession.js";
import type { HandFeatures } from "./landmarks.js";

/**
 * Hands-free capture for the calibration wizard.
 *
 * The original wizard asked the user to hold a gesture *and* press a button.
 * That is close to impossible: you have one hand in the air holding the pose,
 * so you either click with the other hand (awkward, and it puts a second hand
 * in frame where the tracker may latch onto it) or you break the pose to
 * reach the mouse — which means the thing being measured is the motion of
 * giving up on the pose. It is the single biggest reason calibration felt bad.
 *
 * So capture arms itself. The wizard watches the live feature stream, waits
 * until the hand has been *held steady* for a moment, counts down so the user
 * knows it's coming, then records. No clicking, no second hand, and the
 * samples are of an actually-settled pose.
 */

export type CaptureStage = "waiting" | "steadying" | "counting" | "recording" | "done";

export interface AutoCaptureState {
  stage: CaptureStage;
  /** 0..1 through the current stage — drives the ring/bar. */
  progress: number;
  /** Whole seconds left on the countdown, for the big numeral. */
  countdown: number;
  /** Live hand present at all? */
  present: boolean;
  /** Why we're still waiting, in words the user can act on. */
  hint: string;
}

interface Options {
  /** Pull the value(s) being measured out of a frame. */
  sample: (f: HandFeatures) => void;
  /**
   * Stability channels — capture waits until *every* one stops changing.
   *
   * A vector rather than a scalar because a single number can't separate the
   * poses we care about. Openness, for instance, is nearly identical for
   * "point" and "L shape" (both have one finger out), so a hand drifting
   * between the two would read as perfectly steady and get recorded as a
   * blurred average of both.
   */
  metric: (f: HandFeatures) => readonly number[];
  /** Called with the number of samples gathered. */
  onDone: (samples: number) => void;
  /** Max drift in `metric` over the steady window that still counts as still. */
  tolerance?: number;
  /** How long the hand must be steady before the countdown starts. */
  steadyMs?: number;
  /** Countdown before recording. */
  countdownMs?: number;
  /** Recording window. */
  recordMs?: number;
  /** Pause the machine (step not active). */
  enabled: boolean;
}

const HISTORY = 12;

export function useAutoCapture(opts: Options): AutoCaptureState & { restart: () => void } {
  const [state, setState] = useState<AutoCaptureState>({
    stage: "waiting",
    progress: 0,
    countdown: 0,
    present: false,
    hint: "Hold your hand up where the camera can see it",
  });

  // Everything the rAF loop touches lives in refs; re-creating the loop on
  // every state change would reset the very timers it's measuring.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stageRef = useRef<CaptureStage>("waiting");
  const steadySinceRef = useRef<number | null>(null);
  const stageStartRef = useRef<number>(0);
  const historyRef = useRef<number[][]>([]);
  const samplesRef = useRef(0);

  const restart = useCallback(() => {
    stageRef.current = "waiting";
    steadySinceRef.current = null;
    historyRef.current = [];
    samplesRef.current = 0;
    setState({
      stage: "waiting",
      progress: 0,
      countdown: 0,
      present: false,
      hint: "Hold your hand up where the camera can see it",
    });
  }, []);

  useEffect(() => {
    if (!opts.enabled) return;
    restart();

    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const o = optsRef.current;
      const now = performance.now();
      const f = getActiveSession()?.snapshot?.features ?? null;

      if (!f) {
        stageRef.current = "waiting";
        steadySinceRef.current = null;
        historyRef.current = [];
        setState({
          stage: "waiting",
          progress: 0,
          countdown: 0,
          present: false,
          hint: "Hold your hand up where the camera can see it",
        });
        return;
      }

      const tolerance = o.tolerance ?? 0.06;
      const steadyMs = o.steadyMs ?? 600;
      const countdownMs = o.countdownMs ?? 1400;
      const recordMs = o.recordMs ?? 1200;

      // Rolling window of every stability channel.
      const hist = historyRef.current;
      hist.push([...o.metric(f)]);
      if (hist.length > HISTORY) hist.shift();
      let drift = Number.POSITIVE_INFINITY;
      if (hist.length >= HISTORY) {
        // The worst-drifting channel decides: steady means steady everywhere.
        drift = 0;
        const channels = hist[0]!.length;
        for (let c = 0; c < channels; c++) {
          let lo = Number.POSITIVE_INFINITY;
          let hi = Number.NEGATIVE_INFINITY;
          for (const row of hist) {
            const v = row[c] ?? 0;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          drift = Math.max(drift, hi - lo);
        }
      }
      const steady = drift <= tolerance;

      switch (stageRef.current) {
        case "waiting":
        case "steadying": {
          if (!steady) {
            steadySinceRef.current = null;
            setState({
              stage: "steadying",
              progress: 0,
              countdown: 0,
              present: true,
              hint: "Hold the pose still…",
            });
            break;
          }
          if (steadySinceRef.current === null) steadySinceRef.current = now;
          const held = now - steadySinceRef.current;
          if (held >= steadyMs) {
            stageRef.current = "counting";
            stageStartRef.current = now;
            samplesRef.current = 0;
          }
          setState({
            stage: "steadying",
            progress: Math.min(1, held / steadyMs),
            countdown: 0,
            present: true,
            hint: "Holding steady…",
          });
          break;
        }

        case "counting": {
          // Breaking the pose cancels — the user changed their mind, or the
          // tracker latched onto the wrong thing.
          if (!steady) {
            stageRef.current = "waiting";
            steadySinceRef.current = null;
            setState({
              stage: "steadying",
              progress: 0,
              countdown: 0,
              present: true,
              hint: "Moved — hold the pose still…",
            });
            break;
          }
          const elapsed = now - stageStartRef.current;
          if (elapsed >= countdownMs) {
            stageRef.current = "recording";
            stageStartRef.current = now;
            break;
          }
          setState({
            stage: "counting",
            progress: elapsed / countdownMs,
            countdown: Math.ceil((countdownMs - elapsed) / 1000),
            present: true,
            hint: "Keep holding — recording in…",
          });
          break;
        }

        case "recording": {
          o.sample(f);
          samplesRef.current++;
          const elapsed = now - stageStartRef.current;
          if (elapsed >= recordMs) {
            stageRef.current = "done";
            cancelAnimationFrame(raf);
            setState({
              stage: "done",
              progress: 1,
              countdown: 0,
              present: true,
              hint: "Got it",
            });
            o.onDone(samplesRef.current);
            return;
          }
          setState({
            stage: "recording",
            progress: elapsed / recordMs,
            countdown: 0,
            present: true,
            hint: "Recording — keep still",
          });
          break;
        }

        case "done":
          cancelAnimationFrame(raf);
          return;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `opts` is read through a ref; only enablement should restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, restart]);

  return { ...state, restart };
}
