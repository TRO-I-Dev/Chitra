import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Card } from "@chitra/core";
import { CARD_TYPE_STYLES } from "../cardStyles.js";

export interface CardNodeData extends Record<string, unknown> {
  card: Card;
}

/**
 * Custom React Flow node that renders a Chitra card with the type's accent
 * gradient and a four-sided handle so edges can attach from any direction.
 */
export function CardNode({ data, selected }: NodeProps): JSX.Element {
  const card = (data as CardNodeData).card;
  const style = CARD_TYPE_STYLES[card.type];

  return (
    <div
      className={[
        "relative w-[220px] rounded-2xl border bg-gradient-to-br p-3 shadow-lg shadow-black/40 backdrop-blur-md transition",
        style.tone,
        selected
          ? "ring-2 ring-[var(--color-accent-2)]/60 ring-offset-2 ring-offset-[#0b0b10]"
          : "",
      ].join(" ")}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-80">
        <span>{style.emoji}</span>
        <span>{style.label}</span>
      </div>
      <div className="line-clamp-2 text-sm font-semibold leading-snug">{card.title}</div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-snug opacity-75">
        {flattenBody(card)}
      </div>

      {/* Four directional handles, each acting as both source AND target so
          edges can be drawn in any direction. */}
      <Handle id="t-src" type="source" position={Position.Top}    className="!h-2 !w-2 !border-0 !bg-white/40" />
      <Handle id="t-tgt" type="target" position={Position.Top}    className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="r-src" type="source" position={Position.Right}  className="!h-2 !w-2 !border-0 !bg-white/40" />
      <Handle id="r-tgt" type="target" position={Position.Right}  className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="b-src" type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-white/40" />
      <Handle id="b-tgt" type="target" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="l-src" type="source" position={Position.Left}   className="!h-2 !w-2 !border-0 !bg-white/40" />
      <Handle id="l-tgt" type="target" position={Position.Left}   className="!h-2 !w-2 !border-0 !bg-transparent" />
    </div>
  );
}

function flattenBody(card: Card): string {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(card.body);
  return out.join(" ").slice(0, 200);
}
