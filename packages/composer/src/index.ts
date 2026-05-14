import type { CardType, RichDoc } from "@chitra/core";

export interface ClassifierSuggestion {
  type: CardType;
  /** 0..1 confidence that this is the right type. */
  confidence: number;
  /** Human-readable reason ("matched keyword 'risk'") for UI tooltips. */
  reason: string;
}

export interface ComposerDraft {
  title: string;
  body: RichDoc;
  /** All candidate types ranked by confidence; first entry is the best guess. */
  suggestions: ClassifierSuggestion[];
}

/* ------------------------------------------------------------------ *
 *  Heuristic banks                                                    *
 * ------------------------------------------------------------------ */

interface Rule {
  type: CardType;
  /** Each match adds `weight` to the score. */
  weight: number;
  test: (text: string, lower: string) => boolean;
  reason: string;
}

const KEYWORD_RULES: Array<{ type: CardType; words: string[]; weight: number }> = [
  { type: "risk", weight: 0.5, words: ["risk", "threat", "blocker", "concern", "issue"] },
  { type: "metric", weight: 0.45, words: ["kpi", "metric", "north star", "conversion", "retention"] },
  { type: "persona", weight: 0.5, words: ["persona", "user is", "as a user", "customer is", "buyer"] },
  { type: "goal", weight: 0.45, words: ["goal", "objective", "outcome", "target", "vision"] },
  { type: "decision", weight: 0.55, words: ["decided", "we will", "adr", "decision:", "chose"] },
  { type: "step", weight: 0.4, words: ["step", "then", "next", "first", "finally"] },
  { type: "data", weight: 0.45, words: ["schema", "table", "model", "entity", "field"] },
  {
    type: "component",
    weight: 0.45,
    words: ["service", "module", "api", "queue", "worker", "database", "frontend", "backend"],
  },
];

const RULES: Rule[] = KEYWORD_RULES.flatMap(({ type, words, weight }) =>
  words.map<Rule>((w) => ({
    type,
    weight,
    test: (_t, lower) => new RegExp(`\\b${w}\\b`).test(lower),
    reason: `matched keyword "${w}"`,
  })),
);

// Structural rules layered on top of keywords.
RULES.push(
  {
    type: "metric",
    weight: 0.4,
    test: (t) => /\b\d+(\.\d+)?\s?(%|ms|s|req\/s|users|MAU|DAU)\b/i.test(t),
    reason: "contains a number with a unit",
  },
  {
    type: "step",
    weight: 0.35,
    test: (t) => /^\s*(\d+\.|[-*•])\s+/m.test(t) || /^(do|run|deploy|build|create) /i.test(t.trim()),
    reason: "looks like an imperative or list item",
  },
  {
    type: "goal",
    weight: 0.3,
    test: (t) => /\b(should|must|shall|need to|aim to)\b/i.test(t),
    reason: "expresses an obligation",
  },
  {
    type: "note",
    weight: 0.1,
    test: () => true,
    reason: "default fallback",
  },
);

/* ------------------------------------------------------------------ *
 *  Public API                                                         *
 * ------------------------------------------------------------------ */

const FIRST_LINE = /^(.*?)(?:\n|$)/;
const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*$/m;

export function extractTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Untitled";
  const heading = MARKDOWN_HEADING.exec(trimmed);
  if (heading?.[1]) return truncate(heading[1], 80);
  const first = FIRST_LINE.exec(trimmed)?.[1] ?? trimmed;
  return truncate(first, 80);
}

export function classify(text: string): ClassifierSuggestion[] {
  const lower = text.toLowerCase();
  const scores = new Map<CardType, { score: number; reasons: string[] }>();

  for (const rule of RULES) {
    if (rule.test(text, lower)) {
      const acc = scores.get(rule.type) ?? { score: 0, reasons: [] };
      acc.score += rule.weight;
      acc.reasons.push(rule.reason);
      scores.set(rule.type, acc);
    }
  }

  const total = Array.from(scores.values()).reduce((s, v) => s + v.score, 0) || 1;
  const ranked: ClassifierSuggestion[] = Array.from(scores.entries())
    .map(([type, { score, reasons }]) => ({
      type,
      confidence: Math.min(1, score / total),
      reason: reasons[0] ?? "",
    }))
    .sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) {
    return [{ type: "note", confidence: 1, reason: "default fallback" }];
  }
  return ranked;
}

export function compose(text: string): ComposerDraft {
  const title = extractTitle(text);
  const suggestions = classify(text);
  const body: RichDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text
          ? [{ type: "text", text }]
          : [],
      },
    ],
  };
  return { title, body, suggestions };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trimEnd()}…`;
}
