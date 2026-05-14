import type { CardType } from "@chitra/core";

interface TypeStyle {
  label: string;
  emoji: string;
  /** Tailwind classes for the card chip / accent. */
  tone: string;
  /** Hex color for canvas use. */
  color: string;
}

export const CARD_TYPE_STYLES: Record<CardType, TypeStyle> = {
  goal:      { label: "Goal",      emoji: "◎", tone: "from-fuchsia-400/20 to-fuchsia-400/5 text-fuchsia-200 border-fuchsia-400/30", color: "#e879f9" },
  component: { label: "Component", emoji: "▣", tone: "from-sky-400/20 to-sky-400/5 text-sky-200 border-sky-400/30",                color: "#38bdf8" },
  persona:   { label: "Persona",   emoji: "☻", tone: "from-amber-400/20 to-amber-400/5 text-amber-200 border-amber-400/30",        color: "#fbbf24" },
  metric:    { label: "Metric",    emoji: "▲", tone: "from-emerald-400/20 to-emerald-400/5 text-emerald-200 border-emerald-400/30",color: "#34d399" },
  risk:      { label: "Risk",      emoji: "!",  tone: "from-rose-400/20 to-rose-400/5 text-rose-200 border-rose-400/30",            color: "#fb7185" },
  step:      { label: "Step",      emoji: "→", tone: "from-violet-400/20 to-violet-400/5 text-violet-200 border-violet-400/30",    color: "#a78bfa" },
  note:      { label: "Note",      emoji: "✎", tone: "from-zinc-400/20 to-zinc-400/5 text-zinc-200 border-zinc-400/30",            color: "#a1a1aa" },
  decision:  { label: "Decision",  emoji: "✦", tone: "from-indigo-400/20 to-indigo-400/5 text-indigo-200 border-indigo-400/30",    color: "#818cf8" },
  data:      { label: "Data",      emoji: "≡", tone: "from-teal-400/20 to-teal-400/5 text-teal-200 border-teal-400/30",            color: "#2dd4bf" },
};

export const CARD_TYPES: CardType[] = [
  "goal", "component", "persona", "metric", "risk", "step", "decision", "data", "note",
];
