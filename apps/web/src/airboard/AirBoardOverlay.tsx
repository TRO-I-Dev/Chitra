import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { CardType } from "@chitra/core";
import { useProjectStore } from "../state/projectStore.js";
import { AirCalibration } from "./AirCalibration.js";
import { AirSettings } from "./AirSettings.js";
import { AirTutorial } from "./AirTutorial.js";
import { AIR_COLORS, AIR_TOOLS, type AirTool, inkStyleFor, useAirBoard } from "./airBoardStore.js";
import { AirSession } from "./airSession.js";
import { pageToFlow } from "./flowBridge.js";
import { ACTION_LABELS, gestureForAction, gestureMeta } from "./gestureProfile.js";
import type { Box } from "./strokeShaper.js";

/**
 * The Air Board overlay.
 *
 * Renders on top of the studio canvas while Air Board mode is active and owns
 * the whole camera → gesture → ink loop through an `AirSession`. React here is
 * only responsible for chrome: the HUD, the tool ring, the camera thumbnail
 * and the two modals. Everything that moves at frame rate is painted straight
 * onto the canvas by the session.
 */
export function AirBoardOverlay(): JSX.Element | null {
  const active = useAirBoard((s) => s.active);
  const phase = useAirBoard((s) => s.phase);
  const statusMessage = useAirBoard((s) => s.statusMessage);
  const fps = useAirBoard((s) => s.fps);
  const inferenceMs = useAirBoard((s) => s.inferenceMs);
  const resolution = useAirBoard((s) => s.resolution);
  const tool = useAirBoard((s) => s.tool);
  const color = useAirBoard((s) => s.color);
  const strokeWidth = useAirBoard((s) => s.strokeWidth);
  const profile = useAirBoard((s) => s.profile);
  const ringOpen = useAirBoard((s) => s.ringOpen);
  const calibrationOpen = useAirBoard((s) => s.calibrationOpen);
  const settingsOpen = useAirBoard((s) => s.settingsOpen);
  const tutorialOpen = useAirBoard((s) => s.tutorialOpen);
  const previewOn = useAirBoard((s) => s.previewOn);
  const cleanBoard = useAirBoard((s) => s.cleanBoard);
  const cameraId = useAirBoard((s) => s.cameraId);
  const lastShape = useAirBoard((s) => s.lastShape);

  const setPhase = useAirBoard((s) => s.setPhase);
  const setPerf = useAirBoard((s) => s.setPerf);
  const setTool = useAirBoard((s) => s.setTool);
  const setRingOpen = useAirBoard((s) => s.setRingOpen);
  const setCalibrationOpen = useAirBoard((s) => s.setCalibrationOpen);
  const setSettingsOpen = useAirBoard((s) => s.setSettingsOpen);
  const setTutorialOpen = useAirBoard((s) => s.setTutorialOpen);
  const setCleanBoard = useAirBoard((s) => s.setCleanBoard);
  const noteShape = useAirBoard((s) => s.noteShape);

  const addCard = useProjectStore((s) => s.addCard);
  const addNodeFromCard = useProjectStore((s) => s.addNodeFromCard);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<AirSession | null>(null);

  const [action, setAction] = useState("none");
  const [handVisible, setHandVisible] = useState(false);
  const [ringState, setRingState] = useState({ hover: -1, latched: -1, openness: 0 });
  const [cardDraft, setCardDraft] = useState<{
    pageBox: Box;
    title: string;
    type: CardType;
  } | null>(null);

  const style = useMemo(() => inkStyleFor(tool, color, strokeWidth), [tool, color, strokeWidth]);
  const paused = calibrationOpen || settingsOpen || tutorialOpen || cardDraft !== null;

  /* ---------------- session lifecycle ---------------- */

  useEffect(() => {
    if (!active) return;
    const session = new AirSession(
      {
        profile,
        tool,
        style,
        ringOpen: false,
        ringSlots: AIR_TOOLS.length,
        previewOn,
        cameraId,
        paused: false,
      },
      {
        onStatus: (s) => {
          setPhase(s.phase, s.message ?? null);
          setPerf(s.fps, s.inferenceMs, s.resolution ?? null);
        },
        onShape: (kind, why, confidence) => noteShape({ kind, why, confidence, at: Date.now() }),
        onRing: (open) => setRingOpen(open),
        onRingPick: (index) => {
          const picked = AIR_TOOLS[index];
          if (picked) setTool(picked.id);
        },
        onCardRequest: (_sceneBox, pageBox) => setCardDraft({ pageBox, title: "", type: "note" }),
        onAction: setAction,
        onPresence: setHandVisible,
      },
    );
    sessionRef.current = session;
    session.attachCanvas(canvasRef.current);
    session.attachPreview(previewRef.current);
    void session.start();

    const onResize = (): void => session.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      session.stop();
      sessionRef.current = null;
    };
    // Session is created once per activation; config changes flow through the
    // `update()` effect below so we never re-acquire the camera needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    sessionRef.current?.update({
      profile,
      tool,
      style,
      ringOpen,
      ringSlots: AIR_TOOLS.length,
      previewOn,
      paused,
    });
  }, [profile, tool, style, ringOpen, previewOn, paused]);

  useEffect(() => {
    void sessionRef.current?.setCamera(cameraId);
  }, [cameraId]);

  // Poll the ring state only while the ring is actually open. Polling
  // unconditionally re-rendered the entire overlay 15 times a second for a
  // value nothing was displaying.
  useEffect(() => {
    if (!ringOpen) return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      if (s) setRingState(s.ringState);
    }, 66);
    return () => window.clearInterval(id);
  }, [ringOpen]);

  /* ---------------- keyboard escapes ---------------- */

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "Escape") {
        if (cardDraft) return; // its own handler cancels
        if (ringOpen) {
          setRingOpen(false);
          e.preventDefault();
        }
        return;
      }
      if (typing) return;
      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        setRingOpen(!ringOpen);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, ringOpen, cardDraft, setRingOpen]);

  /* ---------------- card creation ---------------- */

  const commitCard = useCallback((): void => {
    if (!cardDraft) return;
    const title = cardDraft.title.trim() || "Air note";
    const card = addCard({
      title,
      type: cardDraft.type,
      body: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    });
    const at = pageToFlow({ x: cardDraft.pageBox.x, y: cardDraft.pageBox.y });
    addNodeFromCard(card.id, at);
    setCardDraft(null);
    toast.success(`Card “${title}” placed on the board`);
  }, [cardDraft, addCard, addNodeFromCard]);

  if (!active) return null;

  // Ordered as the interaction is actually performed: browse → choose → draw.
  const menuGesture = gestureForAction(profile, "menu");
  const selectGesture = gestureForAction(profile, "select");
  const drawGesture = gestureForAction(profile, "draw");
  const eraseGesture = gestureForAction(profile, "erase");

  /*
   * Rendered into a portal on <body> rather than inside the canvas container.
   *
   * Nested in the React Flow wrapper, the overlay could only ever cover the
   * canvas region — the cursor stopped dead at the sidebar, the header and the
   * board tabs, so it appeared to reach "only a portion of the page". A fixed
   * full-window root makes the whole viewport addressable.
   *
   * The root is pointer-transparent; only the HUD and panels opt back in.
   */
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[55]">
      {/*
        Ink + cursor canvas. Pointer-transparent so the mouse still works.

        `h-full w-full` is load-bearing, not decoration. A <canvas> is a
        *replaced* element: given `inset-0` but no explicit CSS size it falls
        back to its intrinsic attribute size (300×150) rather than stretching to
        the containing block — the insets only position it. Without these the
        cursor is trapped in a small box in the corner, which is precisely what
        "the cursor only covers a portion of the page" looks like.
      */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Vignette that makes air ink readable over any board background. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: handVisible
            ? "inset 0 0 0 2px rgba(124,140,255,0.28), inset 0 0 120px rgba(124,140,255,0.07)"
            : "inset 0 0 0 2px rgba(255,107,138,0.22)",
          transition: "box-shadow 220ms ease",
        }}
      />

      {/* ---------- status / permission gate ---------- */}
      <AnimatePresence>
        {(phase === "requesting-camera" || phase === "loading-model" || phase === "error") && (
          <motion.div
            key="air-status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#07070c]/75 backdrop-blur-sm"
          >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--color-surface)] p-6 text-center shadow-2xl">
              {phase === "error" ? (
                <>
                  <div className="mb-2 text-2xl">📷</div>
                  <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                    Air Board can’t see you
                  </h2>
                  <p className="mb-4 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                    {statusMessage ?? "The camera could not be started."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sessionRef.current?.stop();
                      void sessionRef.current?.start();
                    }}
                    className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-2 text-xs font-semibold text-[#0b0b10]"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-white/15 border-t-[var(--color-accent)]"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Number.POSITIVE_INFINITY, duration: 0.9, ease: "linear" }}
                  />
                  <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                    {phase === "requesting-camera"
                      ? "Waking the camera"
                      : "Loading the vision model"}
                  </h2>
                  <p className="text-xs text-[var(--color-ink-dim)]">
                    {phase === "loading-model"
                      ? "First run only — the model is cached on disk afterwards."
                      : "Allow camera access when your browser asks."}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- radial tool ring ---------- */}
      <AnimatePresence>
        {ringOpen && (
          <motion.div
            key="air-ring"
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <ToolRing
              hover={ringState.hover}
              latched={ringState.latched}
              openness={ringState.openness}
              current={tool}
              onPick={setTool}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- card title prompt ---------- */}
      <AnimatePresence>
        {cardDraft && (
          <motion.div
            key="air-card"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="pointer-events-auto absolute z-50 w-72 rounded-xl border border-white/10 bg-[var(--color-surface)] p-3 shadow-2xl"
            style={{
              left: Math.min(Math.max(cardDraft.pageBox.x, 12), window.innerWidth - 300),
              top: Math.min(Math.max(cardDraft.pageBox.y, 12), window.innerHeight - 180),
            }}
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
              New card from the air
            </div>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={cardDraft.title}
              placeholder="Card title…"
              onChange={(e) => setCardDraft({ ...cardDraft, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCard();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCardDraft(null);
                }
              }}
              className="mb-2 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="mb-3 flex flex-wrap gap-1">
              {(["note", "goal", "component", "decision", "risk", "step"] as CardType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCardDraft({ ...cardDraft, type: t })}
                    className={[
                      "rounded px-1.5 py-0.5 text-[10px] capitalize transition",
                      cardDraft.type === t
                        ? "bg-[var(--color-accent)] text-[#0b0b10]"
                        : "bg-white/5 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCardDraft(null)}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitCard}
                className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-3 py-1 text-xs font-semibold text-[#0b0b10]"
              >
                Place card
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- camera picture-in-picture ---------- */}
      {previewOn && (
        <div className="pointer-events-auto absolute bottom-4 right-4 overflow-hidden rounded-xl border border-white/10 bg-black/70 shadow-2xl backdrop-blur">
          <canvas ref={previewRef} width={224} height={168} className="block h-[126px] w-[168px]" />
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-1 text-[10px] text-[var(--color-ink-dim)]">
            <span className={handVisible ? "text-[var(--color-accent-2)]" : "text-red-300"}>
              {handVisible ? "● hand tracked" : "○ no hand"}
            </span>
            <span title="detector fps · inference per frame · negotiated camera resolution">
              {fps} fps
              {inferenceMs > 0 ? ` · ${inferenceMs.toFixed(1)}ms` : ""}
              {resolution ? ` · ${resolution.w}×${resolution.h}` : ""}
            </span>
          </div>
        </div>
      )}

      {/* ---------- HUD ---------- */}
      <div className="pointer-events-auto absolute left-1/2 top-14 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#0d0d14]/92 px-1.5 py-1 text-[11px] shadow-xl backdrop-blur-md">
          <span className="px-2 font-semibold text-[var(--color-accent)]">Air Board</span>
          <span className="h-4 w-px bg-white/10" />
          {AIR_TOOLS.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              title={`${t.label} — ${t.hint}`}
              onClick={() => setTool(t.id)}
              className={[
                "rounded-full px-2 py-1 transition",
                tool === t.id
                  ? "bg-white/12 text-[var(--color-ink)]"
                  : "text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]",
              ].join(" ")}
            >
              <span aria-hidden="true">{t.glyph}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRingOpen(!ringOpen)}
            title="Tool ring (R, or the menu gesture)"
            className="rounded-full px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            ⌾
          </button>
          <span className="h-4 w-px bg-white/10" />
          <ColorStrip />
          <span className="h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => setCalibrationOpen(true)}
            title="Calibrate your gestures"
            className="rounded-full px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            ✋
          </button>
          <button
            type="button"
            onClick={() => setCleanBoard(!cleanBoard)}
            title={cleanBoard ? "Show the board contents" : "Hide the board for a clean surface"}
            className={[
              "rounded-full px-2 py-1 transition hover:bg-white/5",
              cleanBoard
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            {cleanBoard ? "◻" : "▩"}
          </button>
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            title="Field guide — how to use Air Board"
            className="rounded-full px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Air Board settings"
            className="rounded-full px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ---------- gesture legend + recognition feedback ---------- */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2">
        <AnimatePresence>
          {lastShape && Date.now() - lastShape.at < 2600 && (
            <motion.div
              key={lastShape.at}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg border border-white/10 bg-[#0d0d14]/92 px-3 py-1.5 text-[11px] text-[var(--color-ink)] shadow-lg backdrop-blur"
            >
              <span className="font-semibold capitalize">{lastShape.kind}</span>
              <span className="ml-2 text-[var(--color-ink-dim)]">{lastShape.why}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="rounded-lg border border-white/10 bg-[#0d0d14]/85 px-3 py-2 text-[10px] leading-relaxed text-[var(--color-ink-dim)] shadow-lg backdrop-blur">
          <LegendRow gesture={menuGesture} action="menu" active={action === "menu"} />
          <LegendRow gesture={selectGesture} action="select" active={action === "select"} />
          <LegendRow gesture={drawGesture} action="draw" active={action === "draw"} />
          <LegendRow gesture={eraseGesture} action="erase" active={action === "erase"} />
        </div>
      </div>

      {calibrationOpen && <AirCalibration onClose={() => setCalibrationOpen(false)} />}
      {settingsOpen && <AirSettings onClose={() => setSettingsOpen(false)} />}
      {tutorialOpen && <AirTutorial onClose={() => setTutorialOpen(false)} />}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

function LegendRow({
  gesture,
  action,
  active,
}: {
  gesture: string | null;
  action: keyof typeof ACTION_LABELS;
  active: boolean;
}): JSX.Element | null {
  if (!gesture) return null;
  const meta = gestureMeta(gesture as never);
  return (
    <div
      className={[
        "flex items-center gap-2 transition",
        active ? "text-[var(--color-accent-2)]" : "",
      ].join(" ")}
    >
      <span className="w-4 text-center" aria-hidden="true">
        {meta.glyph}
      </span>
      <span className="w-20 truncate">{meta.label}</span>
      <span className="opacity-70">{ACTION_LABELS[action]}</span>
    </div>
  );
}

function ColorStrip(): JSX.Element {
  const color = useAirBoard((s) => s.color);
  const setColor = useAirBoard((s) => s.setColor);
  return (
    <div className="flex items-center gap-1 px-1">
      {AIR_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.name}
          onClick={() => setColor(c.value)}
          className="h-3.5 w-3.5 rounded-full border transition"
          style={{
            background: c.value,
            borderColor: color === c.value ? "#ffffff" : "rgba(255,255,255,0.2)",
            transform: color === c.value ? "scale(1.25)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * The radial tool ring. Wedges are laid out clockwise from straight up, which
 * matches how `AirSession` computes the hovered index — keep both in step if
 * either changes.
 */
function ToolRing({
  hover,
  latched,
  openness,
  current,
  onPick,
}: {
  hover: number;
  /** ≥0 once the hand starts closing — the choice is frozen pending a fist. */
  latched: number;
  /** 0 = fist, 1 = flat palm. Drives the "keep closing" progress arc. */
  openness: number;
  current: AirTool;
  onPick: (t: AirTool) => void;
}): JSX.Element {
  const n = AIR_TOOLS.length;
  const radius = 132;
  const active = latched >= 0 ? latched : hover;
  const committing = latched >= 0;
  // How far the hand has closed, normalised across the scrub→latch band, so
  // the arc fills as the user makes a fist and reads as "keep going".
  const closeProgress = Math.max(0, Math.min(1, (0.62 - openness) / 0.62));

  return (
    <div
      className="pointer-events-auto relative"
      style={{ width: radius * 2 + 96, height: radius * 2 + 96 }}
    >
      {/* Hub. Turns accent-coloured the moment the choice latches, so the
          state change is visible without reading any text. */}
      <div
        className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[#0d0d14]/85 backdrop-blur-md transition-colors"
        style={{
          borderColor: committing ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
          boxShadow: committing ? "0 0 34px rgba(124,140,255,0.35)" : "none",
        }}
      />
      {/* Closing-progress arc: circumference 2πr with r=71. */}
      {committing && (
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          width={158}
          height={158}
          aria-hidden="true"
        >
          <circle
            cx={79}
            cy={79}
            r={71}
            fill="none"
            stroke="var(--color-accent-2)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 71}
            strokeDashoffset={2 * Math.PI * 71 * (1 - closeProgress)}
            transform="rotate(-90 79 79)"
          />
        </svg>
      )}

      <div className="absolute left-1/2 top-1/2 w-[132px] -translate-x-1/2 -translate-y-1/2 text-center text-[10px] leading-tight text-[var(--color-ink-dim)]">
        <div className="text-lg" aria-hidden="true">
          {AIR_TOOLS[active]?.glyph ?? "🖐"}
        </div>
        <div className="mt-0.5 font-semibold text-[var(--color-ink)]">
          {AIR_TOOLS[active]?.label ?? "Tool ring"}
        </div>
        <div className="mt-1 px-2 opacity-75">
          {committing
            ? "Close your fist to choose"
            : active >= 0
              ? "Close your hand to pick this"
              : "Open palm — move to browse"}
        </div>
      </div>

      {AIR_TOOLS.map((t, i) => {
        // −90° puts slot 0 at the top; the session adds the same offset.
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isActive = active === i;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            title={t.hint}
            className={[
              "absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border text-[10px] transition",
              isActive && committing
                ? "scale-125 border-[var(--color-accent-2)] bg-[var(--color-accent-2)]/30 text-[var(--color-ink)]"
                : isActive
                  ? "scale-110 border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-ink)]"
                  : current === t.id
                    ? "border-white/25 bg-white/10 text-[var(--color-ink)]"
                    : "border-white/10 bg-[#0d0d14]/85 text-[var(--color-ink-dim)]",
            ].join(" ")}
            style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
          >
            <span className="text-lg" aria-hidden="true">
              {t.glyph}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
