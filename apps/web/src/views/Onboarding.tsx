import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogoMark } from "../brand/Logo.js";

const KEY = "chitra.onboarded.v1";

const STEPS: Array<{
  title: string;
  body: string;
  hotkey?: string;
}> = [
  {
    title: "Compose a card",
    body: "Press Ctrl+N to capture a thought. Chitra classifies it automatically (goal, risk, metric, …) so it lands in the right shape.",
    hotkey: "Ctrl+N",
  },
  {
    title: "Drag onto the canvas",
    body: "Drag any inbox card onto the studio. Wire connections between handles to express depends-on, sequence, contains, conflicts-with, informs, or flows-to.",
  },
  {
    title: "Stamp a template",
    body: "Templates → pick a recipe (Lean Canvas, BMC, SWOT, OKR Tree, Roadmap, …) to stamp a fresh board with starter cards.",
  },
  {
    title: "Sketch alongside structure",
    body: "Toggle Sketch mode in the title bar to draw freehand on top of the canvas with Excalidraw — perfect for annotations and quick diagrams.",
  },
  {
    title: "Export anywhere",
    body: "Export → PDF / DOCX / Markdown / PNG / SVG / Interactive HTML, or publish to Notion / Confluence (configure tokens in Settings).",
  },
];

export function Onboarding(): JSX.Element | null {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (localStorage.getItem(KEY) === "1") return;
    setStep(0);
  }, []);

  if (step === null) return null;

  const dismiss = (): void => {
    localStorage.setItem(KEY, "1");
    setStep(null);
  };
  const advance = (): void => {
    if (step === null) return;
    if (step >= STEPS.length - 1) dismiss();
    else setStep(step + 1);
  };

  const current = STEPS[step];
  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="pointer-events-none fixed inset-0 z-40 flex items-end justify-end p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="pointer-events-auto w-[360px] rounded-2xl border border-white/10 bg-[#0d0d14]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur"
        >
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-accent-2)]">
            <LogoMark size={14} />
            <span>Tour</span>
            <span className="text-[var(--color-ink-dim)]">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <h3 className="text-base font-semibold text-[var(--color-ink)]">{current.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">{current.body}</p>
          {current.hotkey && (
            <div className="mt-2 text-[11px] text-[var(--color-ink-dim)]">
              Try: <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[var(--color-ink)]">{current.hotkey}</kbd>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={advance}
              className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-3.5 py-1.5 text-xs font-semibold text-black hover:brightness-110"
            >
              {step === STEPS.length - 1 ? "Got it" : "Next →"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
