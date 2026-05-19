import type { Card, Board, EdgeKind } from "@chitra/core";
import { getActiveProvider } from "../platform/ai/index.js";

/** Walk the RichDoc and stitch text nodes (mirror of CardInspector helper). */
function bodyToText(body: Card["body"]): string {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(body);
  return out.join(" ").trim();
}

/**
 * Build a compact textual description of the board (every node + every
 * edge) and ask the AI provider for a narrative summary. Returns the
 * narrative string, or `null` if no provider is configured.
 */
export async function explainDiagram(args: {
  board: Board;
  cards: Card[];
}): Promise<string | null> {
  const provider = await getActiveProvider();
  if (!provider) return null;

  const cardById = new Map(args.cards.map((c) => [c.id, c]));
  const nodeLines = args.board.nodes.map((n) => {
    const c = cardById.get(n.cardId);
    if (!c) return `- ${n.id}: (missing card)`;
    const body = bodyToText(c.body);
    const shortBody = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    return `- [${c.type}] "${c.title}" (id ${n.id})${shortBody ? ` — ${shortBody}` : ""}`;
  });
  const edgeLines = args.board.edges.map((e) => {
    const src = cardById.get(args.board.nodes.find((n) => n.id === e.source)?.cardId ?? "");
    const dst = cardById.get(args.board.nodes.find((n) => n.id === e.target)?.cardId ?? "");
    return `- ${kindArrow(e.kind)} from "${src?.title ?? e.source}" to "${dst?.title ?? e.target}"${e.label ? ` (${e.label})` : ""}`;
  });

  const userPrompt = `Board: ${args.board.name}

Cards:
${nodeLines.join("\n") || "(none)"}

Edges:
${edgeLines.join("\n") || "(none)"}`;

  const narrative = await provider.complete({
    system: `You are Chitra's explainer. Given a list of cards and the edges between them, write a clear, well-structured prose explanation of the diagram. Group related cards, follow dependency / sequence arrows, and call out risks and decisions explicitly. Keep it under 300 words. Use markdown headings sparingly.`,
    user: userPrompt,
    responseFormat: "text",
    temperature: 0.4,
    maxTokens: 900,
  });
  return narrative.trim();
}

function kindArrow(k: EdgeKind): string {
  switch (k) {
    case "depends-on": return "depends-on";
    case "sequence": return "→";
    case "contains": return "contains";
    case "conflicts-with": return "conflicts-with";
    case "informs": return "informs";
    case "flows-to": return "flows-to";
    case "straight":
    default: return "→";
  }
}
