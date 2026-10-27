import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAirBoard } from "./airBoardStore.js";
import { getActiveSession } from "./airSession.js";
import { checkCalibration } from "./calibrationQuality.js";
import {
  ACTION_LABELS,
  GESTURES,
  type GestureCalibration,
  type GestureId,
  type Handedness,
} from "./gestureProfile.js";
import type { HandFeatures } from "./landmarks.js";
import { useAutoCapture } from "./useAutoCapture.js";

/**
 * Calibration wizard.
 *
 * Everyone's hands are different — finger length, how far a "pinch" actually
 * closes, how much of a fist a fist is — and one-size thresholds are the main
 * reason mid-air interfaces feel unreliable. This records *the user's* version
 * of each gesture and derives every threshold from those samples.
 *
 * Two things make it work rather than merely exist:
 *
 * 1. **Nothing is clicked.** Capture arms itself once the hand holds steady
 *    (see `useAutoCapture`). Asking someone to hold a pose *and* press a
 *    button means measuring the motion of them reaching for the mouse.
 * 2. **The reach step is a game, not a form.** Touching five targets teaches
 *    the adaptive reach envelope its extremes while simultaneously proving to
 *    the user that the cursor reaches the whole board.
 *
 * It reads landmarks from the already-running `AirSession`, so no second
 * camera stream is opened.
 */

type Step =
  | { kind: "intro" }
  | { kind: "hand" }
  | { kind: "reach" }
  | { kind: "pinch"; gesture: GestureId; stage: "closed" | "open" }
  | { kind: "pose"; gesture: GestureId }
  | { kind: "verify" }
  | { kind: "done" };

/** The gestures Phase 1 depends on; everything else is optional polish. */
const CORE: readonly GestureId[] = ["open-palm", "fist", "point"];

export function AirCalibration({ onClose }: { onClose: () => void }): JSX.Element {
  const profile = useAirBoard((s) => s.profile);
  const setProfile = useAirBoard((s) => s.setProfile);

  const [thorough, setThorough] = useState(false);
  const [index, setIndex] = useState(0);
  const [handChoice, setHandChoice] = useState<Handedness>(profile.hand);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Working copy — only written back when the wizard finishes, so bailing out
  // halfway leaves the previous calibration intact.
  const draft = useRef<{
    calibration: Partial<Record<GestureId, GestureCalibration>>;
    pinchClosed: Partial<Record<GestureId, number>>;
  }>({ calibration: { ...profile.calibration }, pinchClosed: {} });

  const plan = useMemo<Step[]>(() => {
    const steps: Step[] = [{ kind: "intro" }, { kind: "hand" }, { kind: "reach" }];
    for (const g of GESTURES) {
      if (profile.bindings[g.id] === "none") continue;
      if (!thorough && !CORE.includes(g.id) && g.kind !== "pinch") continue;
      if (!thorough && g.kind === "pinch" && g.id !== "pinch-index") continue;
      if (g.kind === "pinch") {
        steps.push({ kind: "pinch", gesture: g.id, stage: "closed" });
        steps.push({ kind: "pinch", gesture: g.id, stage: "open" });
      } else {
        steps.push({ kind: "pose", gesture: g.id });
      }
    }
    steps.push({ kind: "verify" }, { kind: "done" });
    return steps;
  }, [thorough, profile.bindings]);

  const step = plan[Math.min(index, plan.length - 1)] ?? { kind: "done" };
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, plan.length - 1)), [plan.length]);
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const finish = useCallback((): void => {
    setProfile({ ...profile, hand: handChoice, calibration: draft.current.calibration });
    toast.success("Gestures calibrated to your hand");
    onClose();
  }, [profile, handChoice, setProfile, onClose]);

  // Advancing to a new step clears the previous step's result banner.
  useEffect(() => setLastResult(null), []);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#07070c]/88 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center gap-1.5">
          {plan.map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition"
              style={{
                background:
                  i < index
                    ? "var(--color-accent)"
                    : i === index
                      ? "var(--color-accent-2)"
                      : "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${step.kind}`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.16 }}
          >
            {step.kind === "intro" && (
              <IntroStep thorough={thorough} onThorough={setThorough} count={plan.length - 3} />
            )}

            {step.kind === "hand" && <HandStep value={handChoice} onChange={setHandChoice} />}

            {step.kind === "reach" && <ReachStep onComplete={next} />}

            {step.kind === "pinch" && (
              <PinchStep
                key={`${step.gesture}-${step.stage}`}
                gesture={step.gesture}
                stage={step.stage}
                bindingLabel={ACTION_LABELS[profile.bindings[step.gesture]]}
                draft={draft.current}
                onResult={setLastResult}
                onDone={next}
              />
            )}

            {step.kind === "pose" && (
              <PoseStep
                key={step.gesture}
                gesture={step.gesture}
                bindingLabel={ACTION_LABELS[profile.bindings[step.gesture]]}
                draft={draft.current}
                onResult={setLastResult}
                onDone={next}
              />
            )}

            {step.kind === "verify" && <VerifyStep calibration={draft.current.calibration} />}

            {step.kind === "done" && <DoneStep />}
          </motion.div>
        </AnimatePresence>

        {lastResult && (
          <div className="mt-3 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-[11px] text-[var(--color-ink)]">
            {lastResult}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {index > 0 && step.kind !== "done" && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Back
              </button>
            )}
            {step.kind === "done" ? (
              <button
                type="button"
                onClick={finish}
                className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-1.5 text-xs font-semibold text-[#0b0b10]"
              >
                Save calibration
              </button>
            ) : step.kind === "intro" || step.kind === "hand" || step.kind === "verify" ? (
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-1.5 text-xs font-semibold text-[#0b0b10]"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function IntroStep({
  thorough,
  onThorough,
  count,
}: {
  thorough: boolean;
  onThorough: (v: boolean) => void;
  count: number;
}): JSX.Element {
  return (
    <>
      <h2 className="mb-2 text-base font-semibold text-[var(--color-ink)]">
        Teach Air Board your hands
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
        Hand shapes vary a lot between people, and fixed thresholds are why most mid-air drawing
        feels unreliable. Each gesture below is recorded from <em>your</em> hand, and every
        threshold is fitted to those samples.
      </p>
      <p className="mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--color-ink)]">
        You never have to click anything. Just hold the pose — recording starts on its own once your
        hand is steady.
      </p>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => onThorough(false)}
          className={[
            "flex-1 rounded-xl border px-3 py-3 text-left text-xs transition",
            !thorough
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-ink)]"
              : "border-white/10 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
          ].join(" ")}
        >
          <div className="font-semibold">Quick</div>
          <div className="mt-0.5 opacity-70">Palm, fist, point and pinch — about a minute.</div>
        </button>
        <button
          type="button"
          onClick={() => onThorough(true)}
          className={[
            "flex-1 rounded-xl border px-3 py-3 text-left text-xs transition",
            thorough
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-ink)]"
              : "border-white/10 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
          ].join(" ")}
        >
          <div className="font-semibold">Everything</div>
          <div className="mt-0.5 opacity-70">All bound gestures, including the rarer ones.</div>
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-ink-dim)]">{count} gestures to record.</p>
    </>
  );
}

function HandStep({
  value,
  onChange,
}: {
  value: Handedness;
  onChange: (h: Handedness) => void;
}): JSX.Element {
  return (
    <>
      <h2 className="mb-2 text-base font-semibold text-[var(--color-ink)]">
        Which hand will you draw with?
      </h2>
      <p className="mb-4 text-xs text-[var(--color-ink-dim)]">
        “Either” follows whichever hand is most confidently tracked — handy if you swap, slightly
        more prone to jumping if both are in frame.
      </p>
      <div className="flex gap-2">
        {(["Left", "Right", "Any"] as Handedness[]).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            className={[
              "flex-1 rounded-xl border px-3 py-3 text-xs transition",
              value === h
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-ink)]"
                : "border-white/10 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            {h === "Any" ? "Either hand" : `${h} hand`}
          </button>
        ))}
      </div>
    </>
  );
}

/** Five targets the user drives the cursor into. Corners first, centre last. */
const TARGETS = [
  { id: "tl", x: 0.1, y: 0.12, label: "top left" },
  { id: "tr", x: 0.9, y: 0.12, label: "top right" },
  { id: "br", x: 0.9, y: 0.88, label: "bottom right" },
  { id: "bl", x: 0.1, y: 0.88, label: "bottom left" },
  { id: "c", x: 0.5, y: 0.5, label: "centre" },
] as const;

/**
 * Reach check.
 *
 * Doubles as the reach *calibration*: driving the cursor into all four corners
 * is exactly the movement that teaches the adaptive envelope its extremes. It
 * also proves to the user, before they draw anything, that the cursor really
 * does cover the whole board — which is the complaint this replaces.
 */
function ReachStep({ onComplete }: { onComplete: () => void }): JSX.Element {
  const [hit, setHit] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const snap = getActiveSession()?.snapshot;
      if (!snap || snap.lost) {
        setCursor(null);
        return;
      }
      const c = snap.cursor;
      setCursor(c);
      setHit((prev) => {
        const found = TARGETS.find(
          (t) => Math.hypot(c.x - t.x, c.y - t.y) < 0.13 && !prev.has(t.id),
        );
        if (!found) return prev;
        const next = new Set(prev);
        next.add(found.id);
        return next;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (hit.size === TARGETS.length && !completedRef.current) {
      completedRef.current = true;
      toast.success("Reach mapped — the cursor covers the whole board");
      const id = window.setTimeout(onComplete, 700);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [hit, onComplete]);

  return (
    <>
      <h2 className="mb-2 text-base font-semibold text-[var(--color-ink)]">Map your reach</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
        Move your hand to steer the dot into all five targets. This teaches Air Board how far you
        actually reach, so the cursor covers the whole board instead of bunching up in the middle.
      </p>

      <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-black/35">
        {TARGETS.map((t) => {
          const done = hit.has(t.id);
          return (
            <div
              key={t.id}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition"
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                borderColor: done ? "var(--color-accent-2)" : "rgba(255,255,255,0.22)",
                background: done ? "var(--color-accent-2)" : "transparent",
                transform: `translate(-50%,-50%) scale(${done ? 0.8 : 1})`,
              }}
            >
              {done && (
                <span className="text-xs font-bold text-[#0b0b10]" aria-hidden="true">
                  ✓
                </span>
              )}
            </div>
          );
        })}
        {cursor && (
          <div
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--color-accent)]"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          />
        )}
        {!cursor && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--color-ink-dim)]">
            Hold your hand up where the camera can see it
          </div>
        )}
      </div>

      <div className="text-[11px] text-[var(--color-ink-dim)]">
        {hit.size} / {TARGETS.length} reached
        {hit.size < TARGETS.length && cursor
          ? ` — next: ${TARGETS.find((t) => !hit.has(t.id))?.label}`
          : ""}
      </div>
    </>
  );
}

function PinchStep({
  gesture,
  stage,
  bindingLabel,
  draft,
  onResult,
  onDone,
}: {
  gesture: GestureId;
  stage: "closed" | "open";
  bindingLabel: string;
  draft: {
    calibration: Partial<Record<GestureId, GestureCalibration>>;
    pinchClosed: Partial<Record<GestureId, number>>;
  };
  onResult: (s: string | null) => void;
  onDone: () => void;
}): JSX.Element {
  const meta = GESTURES.find((g) => g.id === gesture)!;
  const channel = meta.channel ?? "pinchIndex";
  const values = useRef<number[]>([]);
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const f = getActiveSession()?.snapshot?.features;
      setLive(f ? f[channel] : null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [channel]);

  const capture = useAutoCapture({
    enabled: true,
    tolerance: 0.05,
    metric: (f) => [f[channel]],
    sample: (f) => values.current.push(f[channel]),
    onDone: (n) => {
      if (n < 6) {
        onResult("Didn’t get a clean read — hold the pose again.");
        return;
      }
      const v = median(values.current);
      if (stage === "closed") {
        draft.pinchClosed[gesture] = v;
        onResult(`Closed pinch measured at ${v.toFixed(2)}.`);
      } else {
        const closed = draft.pinchClosed[gesture];
        if (closed === undefined) return;
        // Trigger a third of the way from closed to open and release two
        // thirds along — a wide, deliberate hysteresis band fitted to this
        // user's actual range of motion.
        const span = Math.max(v - closed, 0.05);
        draft.calibration[gesture] = {
          ...draft.calibration[gesture],
          onThreshold: closed + span * 0.34,
          offThreshold: closed + span * 0.68,
          calibratedAt: new Date().toISOString(),
        };
        onResult(`Pinch range ${closed.toFixed(2)} → ${v.toFixed(2)}. Trigger set.`);
      }
      onDone();
    },
  });

  return (
    <>
      <StepHeading
        glyph={meta.glyph}
        eyebrow={`${meta.label} · ${stage} · ${bindingLabel}`}
        title={
          stage === "closed"
            ? meta.instruction
            : "Now separate those two fingers comfortably and hold."
        }
        hint={
          stage === "closed"
            ? "Hold it steady — recording starts by itself."
            : "This sets how far apart counts as “pen up”. Relaxed and apart, not splayed."
        }
      />
      <LiveMeter value={live} max={1.6} />
      <CaptureStatus state={capture} />
    </>
  );
}

function PoseStep({
  gesture,
  bindingLabel,
  draft,
  onResult,
  onDone,
}: {
  gesture: GestureId;
  bindingLabel: string;
  draft: { calibration: Partial<Record<GestureId, GestureCalibration>> };
  onResult: (s: string | null) => void;
  onDone: () => void;
}): JSX.Element {
  const meta = GESTURES.find((g) => g.id === gesture)!;
  const rows = useRef<number[][]>([]);
  const [live, setLive] = useState<readonly number[] | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const f = getActiveSession()?.snapshot?.features;
      setLive(f ? f.extension : null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const capture = useAutoCapture({
    enabled: true,
    tolerance: 0.09,
    // Every finger, not just openness: "point" and "L shape" have almost
    // identical openness, so a hand drifting between them would look steady.
    metric: (f: HandFeatures) => f.extension,
    sample: (f) => rows.current.push([...f.extension]),
    onDone: (n) => {
      if (n < 6) {
        onResult("Didn’t get a clean read — hold the pose again.");
        return;
      }
      const data = rows.current;
      const centroid = [0, 1, 2, 3, 4].map(
        (i) => data.reduce((s, r) => s + (r[i] ?? 0), 0) / data.length,
      ) as [number, number, number, number, number];
      // Per-axis standard deviation, not just a scalar. This is what lets the
      // classifier weight each finger by how consistently *this* user holds it
      // in *this* pose — see `GestureCalibration.deviation`.
      const deviation = [0, 1, 2, 3, 4].map((i) => {
        const mean = centroid[i]!;
        const variance = data.reduce((s, r) => s + ((r[i] ?? 0) - mean) ** 2, 0) / data.length;
        return Math.sqrt(variance);
      }) as [number, number, number, number, number];
      const spread = deviation.reduce((a, b) => a + b, 0) / 5;
      draft.calibration[gesture] = {
        ...draft.calibration[gesture],
        centroid,
        deviation,
        spread: Math.min(spread, 0.4),
        calibratedAt: new Date().toISOString(),
      };
      onResult(
        `Recorded — steadiness ${spread < 0.06 ? "excellent" : spread < 0.12 ? "good" : "loose (recognition will be forgiving)"}.`,
      );
      onDone();
    },
  });

  return (
    <>
      <StepHeading
        glyph={meta.glyph}
        eyebrow={`Pose · ${meta.label} · ${bindingLabel}`}
        title={meta.instruction}
        hint="Hold it steady — how still you hold it also sets how strict recognition will be."
      />
      <FingerBars extension={live} />
      <CaptureStatus state={capture} />
    </>
  );
}

/** Live confirmation that the freshly-recorded gestures actually fire. */
function VerifyStep({
  calibration,
}: {
  calibration: Partial<Record<GestureId, GestureCalibration>>;
}): JSX.Element {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string>("none");
  // Computed once on mount: the recordings are final by the time we get here.
  const [issues] = useState(() => checkCalibration(calibration));

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const snap = getActiveSession()?.snapshot;
      const action = snap && !snap.lost ? snap.action : "none";
      setCurrent(action);
      if (action !== "none") {
        setSeen((prev) => (prev.has(action) ? prev : new Set(prev).add(action)));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const checks = [
    { action: "menu", label: "Open your palm", glyph: "🖐" },
    { action: "select", label: "Close your fist", glyph: "✊" },
    { action: "draw", label: "Point your index finger", glyph: "☝" },
  ];

  return (
    <>
      <h2 className="mb-2 text-base font-semibold text-[var(--color-ink)]">Try it</h2>
      <p className="mb-4 text-xs leading-relaxed text-[var(--color-ink-dim)]">
        Run through the three core gestures. Each one lights up when Air Board recognises it — if
        one refuses, step back and record it again.
      </p>
      <div className="space-y-2">
        {checks.map((c) => {
          const done = seen.has(c.action);
          const active = current === c.action;
          return (
            <div
              key={c.action}
              className={[
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                active
                  ? "border-[var(--color-accent-2)] bg-[var(--color-accent-2)]/15"
                  : done
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
                    : "border-white/10",
              ].join(" ")}
            >
              <span className="text-xl" aria-hidden="true">
                {c.glyph}
              </span>
              <span className="flex-1 text-xs text-[var(--color-ink)]">{c.label}</span>
              <span className="text-[11px] text-[var(--color-ink-dim)]">
                {active ? "detecting now" : done ? "✓ works" : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-[var(--color-ink-dim)]">
        {Object.values(calibration).filter((c) => c?.calibratedAt).length} gestures recorded ·
        current action: <span className="text-[var(--color-ink)]">{current}</span>
      </p>

      {issues.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink)]">
            Worth fixing
          </div>
          {issues.map((issue) => (
            <div
              key={issue.kind + issue.gestures.join()}
              className={[
                "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                issue.severity === "error"
                  ? "border-red-400/40 bg-red-400/10 text-red-200"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200",
              ].join(" ")}
            >
              {issue.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DoneStep(): JSX.Element {
  return (
    <>
      <h2 className="mb-2 text-base font-semibold text-[var(--color-ink)]">All set</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
        Air Board now uses thresholds fitted to your hand. Re-run this any time from the ✋ button,
        and fine-tune smoothing, cursor speed and snapping in ⚙ settings.
      </p>
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--color-ink)]">
        <strong>Open palm</strong> to browse tools → <strong>close your fist</strong> to choose →{" "}
        <strong>point</strong> to draw.
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function StepHeading({
  glyph,
  eyebrow,
  title,
  hint,
}: {
  glyph: string;
  eyebrow: string;
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--color-ink-dim)]">
        {eyebrow}
      </div>
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
        <span className="text-2xl" aria-hidden="true">
          {glyph}
        </span>
        {title}
      </h2>
      <p className="mb-4 text-xs text-[var(--color-ink-dim)]">{hint}</p>
    </>
  );
}

function CaptureStatus({
  state,
}: {
  state: { stage: string; progress: number; countdown: number; present: boolean; hint: string };
}): JSX.Element {
  const tone =
    state.stage === "recording"
      ? "var(--color-accent-2)"
      : state.stage === "counting"
        ? "var(--color-accent)"
        : "rgba(255,255,255,0.25)";
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="text-[var(--color-ink)]">{state.hint}</span>
        {state.stage === "counting" && (
          <span className="text-lg font-bold text-[var(--color-accent)]">{state.countdown}</span>
        )}
        {state.stage === "recording" && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-accent-2)]">
            ● recording
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${state.progress * 100}%`, background: tone }}
        />
      </div>
      {!state.present && (
        <p className="mt-2 text-[10px] text-amber-200">
          No hand detected — hold it up in front of the camera.
        </p>
      )}
    </div>
  );
}

function LiveMeter({ value, max }: { value: number | null; max: number }): JSX.Element {
  const pct = value === null ? 0 : Math.min(1, value / max) * 100;
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-[10px] text-[var(--color-ink-dim)]">
        <span>closed</span>
        <span>{value === null ? "—" : value.toFixed(2)}</span>
        <span>open</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const DIGITS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;

function FingerBars({ extension }: { extension: readonly number[] | null }): JSX.Element {
  return (
    <div className="mb-4 flex gap-2">
      {DIGITS.map((name, i) => {
        const v = extension?.[i] ?? 0;
        return (
          <div key={name} className="flex-1">
            <div className="flex h-16 items-end overflow-hidden rounded-md bg-white/8">
              <div
                className="w-full rounded-md bg-gradient-to-t from-[var(--color-accent)] to-[var(--color-accent-2)] transition-[height] duration-75"
                style={{ height: `${Math.max(4, v * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-center text-[9px] text-[var(--color-ink-dim)]">{name}</div>
          </div>
        );
      })}
    </div>
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
