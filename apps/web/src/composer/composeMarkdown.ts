import type { CardType } from "@chitra/core";
import type { AiCardDraft, AiEdgeDraft, AiComposeResult } from "./aiCompose.js";

/** Heuristic: does the input look like markdown with headings? */
export function looksLikeMarkdown(text: string): boolean {
  return /^\s*#{1,6}\s+\S/m.test(text);
}

interface HeadingNode {
  level: number;
  title: string;
  body: string[];
}

/**
 * Split markdown into one card per `#`/`##`/`###` heading, preserving
 * heading hierarchy as "contains" edges from parent to child. Body text
 * underneath each heading (until the next same-or-higher-level heading)
 * becomes the card's bodyText.
 */
export function composeMarkdown(md: string): AiComposeResult {
  const lines = md.split(/\r?\n/);
  const headings: HeadingNode[] = [];
  let cur: HeadingNode | null = null;
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (m) {
      cur = { level: m[1]!.length, title: m[2]!.trim(), body: [] };
      headings.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (headings.length === 0) {
    // No headings → degenerate single card.
    return {
      cards: [{ title: "Imported note", type: "note", bodyText: md.trim() }],
      edges: [],
    };
  }

  const cards: AiCardDraft[] = headings.map((h) => ({
    title: h.title || "Untitled",
    type: classifyHeading(h.title),
    bodyText: h.body.join("\n").trim(),
  }));

  // Walk headings and emit a "contains" edge from the nearest
  // shallower ancestor to each child.
  const edges: AiEdgeDraft[] = [];
  const stack: number[] = []; // indexes into headings
  headings.forEach((h, i) => {
    while (stack.length > 0 && headings[stack[stack.length - 1]!]!.level >= h.level) {
      stack.pop();
    }
    if (stack.length > 0) {
      edges.push({ fromIndex: stack[stack.length - 1]!, toIndex: i, relation: "contains" });
    }
    stack.push(i);
  });

  return { cards, edges };
}

const TYPE_KEYWORDS: Array<{ type: CardType; words: RegExp }> = [
  { type: "risk", words: /\b(risk|threat|blocker)\b/i },
  { type: "decision", words: /\b(decision|adr|chose|decided)\b/i },
  { type: "goal", words: /\b(goal|objective|outcome)\b/i },
  { type: "metric", words: /\b(metric|kpi|target)\b/i },
  { type: "persona", words: /\b(persona|user|customer)\b/i },
  { type: "step", words: /\b(step|phase|stage)\b/i },
  { type: "data", words: /\b(schema|table|entity|model)\b/i },
  { type: "component", words: /\b(service|module|component|api)\b/i },
];

function classifyHeading(title: string): CardType {
  for (const r of TYPE_KEYWORDS) {
    if (r.words.test(title)) return r.type;
  }
  return "note";
}
