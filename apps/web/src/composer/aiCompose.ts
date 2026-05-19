import type { CardType } from "@chitra/core";
import { getActiveProvider } from "../platform/ai/index.js";

export interface AiCardDraft {
  title: string;
  type: CardType;
  bodyText: string;
}

export interface AiEdgeDraft {
  /** Index into the resulting `cards` array (0-based). */
  fromIndex: number;
  toIndex: number;
  /** Free-text relation. The caller maps it onto an EdgeKind. */
  relation: string;
}

export interface AiComposeResult {
  cards: AiCardDraft[];
  edges: AiEdgeDraft[];
}

const SYSTEM = `You are Chitra's writing assistant. Given a block of text, split it into discrete cards (one per idea), classify each card's type, and suggest semantic edges between them.

Card types (use exactly these slugs):
  note, decision, risk, goal, metric, persona, step, data, component.

Respond with strict JSON in this exact shape:
{
  "cards": [
    { "title": "...", "type": "...", "bodyText": "..." }
  ],
  "edges": [
    { "fromIndex": 0, "toIndex": 1, "relation": "depends-on" }
  ]
}

Rules:
- 1–8 cards max.
- "bodyText" preserves the original wording for that card (no rewriting).
- "relation" must be one of: depends-on, sequence, contains, conflicts-with, informs, flows-to, related.
- If no clear edges, return an empty array.`;

/**
 * AI-backed compose: split a block of writing into structured cards with
 * suggested edges. Returns `null` if no AI provider is configured —
 * caller should fall back to the heuristic single-card composer.
 */
export async function aiCompose(text: string): Promise<AiComposeResult | null> {
  const provider = await getActiveProvider();
  if (!provider) return null;

  const raw = await provider.complete({
    system: SYSTEM,
    user: text.trim(),
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: 1500,
  });

  // Some providers may wrap in ```json fences; strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AI returned non-JSON: ${cleaned.slice(0, 120)}`);
  }
  const obj = parsed as Partial<AiComposeResult>;
  const cards = (obj.cards ?? [])
    .filter((c): c is AiCardDraft =>
      !!c && typeof c.title === "string" && typeof c.type === "string" && typeof c.bodyText === "string",
    )
    .map((c) => ({
      title: c.title.trim() || "Untitled",
      type: normaliseType(c.type),
      bodyText: c.bodyText.trim(),
    }));
  const edges = (obj.edges ?? [])
    .filter((e): e is AiEdgeDraft =>
      !!e && typeof e.fromIndex === "number" && typeof e.toIndex === "number" && typeof e.relation === "string",
    )
    .filter((e) => e.fromIndex >= 0 && e.fromIndex < cards.length &&
                   e.toIndex >= 0 && e.toIndex < cards.length &&
                   e.fromIndex !== e.toIndex);

  return { cards, edges };
}

const VALID_TYPES: CardType[] = [
  "note", "decision", "risk", "goal", "metric", "persona", "step", "data", "component",
];

function normaliseType(t: string): CardType {
  const lower = t.trim().toLowerCase() as CardType;
  return VALID_TYPES.includes(lower) ? lower : "note";
}
