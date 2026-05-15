import type { Card, CardType } from "@chitra/core";

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

/* ------------------------------------------------------------------ *
 *  Accent palette — used when a card opts out of its type colour.    *
 * ------------------------------------------------------------------ */

export interface AccentSwatch {
  id: string;
  label: string;
  /** Hex used for the canvas accent strip + ring. */
  color: string;
  /** Tailwind classes for an inspector pill / chip. */
  tone: string;
}

export const ACCENT_PALETTE: AccentSwatch[] = [
  { id: "violet",  label: "Violet",  color: "#7c5cff", tone: "from-violet-400/30 to-violet-400/5 text-violet-100 border-violet-400/40" },
  { id: "cyan",    label: "Cyan",    color: "#21d4fd", tone: "from-cyan-400/30 to-cyan-400/5 text-cyan-100 border-cyan-400/40" },
  { id: "emerald", label: "Emerald", color: "#34d399", tone: "from-emerald-400/30 to-emerald-400/5 text-emerald-100 border-emerald-400/40" },
  { id: "amber",   label: "Amber",   color: "#fbbf24", tone: "from-amber-400/30 to-amber-400/5 text-amber-100 border-amber-400/40" },
  { id: "rose",    label: "Rose",    color: "#fb7185", tone: "from-rose-400/30 to-rose-400/5 text-rose-100 border-rose-400/40" },
  { id: "sky",     label: "Sky",     color: "#38bdf8", tone: "from-sky-400/30 to-sky-400/5 text-sky-100 border-sky-400/40" },
  { id: "fuchsia", label: "Fuchsia", color: "#e879f9", tone: "from-fuchsia-400/30 to-fuchsia-400/5 text-fuchsia-100 border-fuchsia-400/40" },
  { id: "slate",   label: "Slate",   color: "#94a3b8", tone: "from-slate-400/30 to-slate-400/5 text-slate-100 border-slate-400/40" },
];

/* ------------------------------------------------------------------ *
 *  Icon picker — small curated set so we don't ship a font.          *
 * ------------------------------------------------------------------ */

export const ICON_CHOICES: string[] = [
  "🎯", "⚡", "🧠", "🚧", "📈", "✅", "❓", "💡", "🔧", "🧩", "📌", "🗺️",
];

/* ------------------------------------------------------------------ *
 *  Status & priority — stored under Card.metadata.                   *
 * ------------------------------------------------------------------ */

export type CardStatus = "todo" | "doing" | "done";
export type CardPriority = "low" | "medium" | "high";

export const STATUS_OPTIONS: Array<{ value: CardStatus; label: string; color: string; emoji: string }> = [
  { value: "todo",  label: "To do",   color: "#94a3b8", emoji: "○" },
  { value: "doing", label: "Doing",   color: "#fbbf24", emoji: "◐" },
  { value: "done",  label: "Done",    color: "#34d399", emoji: "●" },
];

export const PRIORITY_OPTIONS: Array<{ value: CardPriority; label: string; bars: number; color: string }> = [
  { value: "low",    label: "Low",    bars: 1, color: "#94a3b8" },
  { value: "medium", label: "Medium", bars: 2, color: "#fbbf24" },
  { value: "high",   label: "High",   bars: 3, color: "#fb7185" },
];

/**
 * Resolve the "effective" visual style for a card, taking per-card overrides
 * (`card.color`, `card.icon`) into account. Falls back to the type style.
 */
export function resolveCardStyle(card: Card): {
  emoji: string;
  label: string;
  tone: string;
  accent: string;
} {
  const type = CARD_TYPE_STYLES[card.type];
  return {
    emoji: card.icon || type.emoji,
    label: type.label,
    tone: type.tone,
    accent: card.color || type.color,
  };
}

/** Read the optional status from Card.metadata. */
export function getCardStatus(card: Card): CardStatus | null {
  const v = (card.metadata as Record<string, unknown> | undefined)?.["status"];
  if (v === "todo" || v === "doing" || v === "done") return v;
  return null;
}

/** Read the optional priority from Card.metadata. */
export function getCardPriority(card: Card): CardPriority | null {
  const v = (card.metadata as Record<string, unknown> | undefined)?.["priority"];
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

