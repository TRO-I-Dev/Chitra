import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Card } from "@chitra/core";
import {
  CARD_TYPE_STYLES,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  getCardStatus,
  getCardPriority,
  resolveCardStyle,
} from "../cardStyles.js";

export interface CardNodeData extends Record<string, unknown> {
  card: Card;
}

/**
 * Custom React Flow node that renders a Chitra card with the type's accent
 * gradient and four-sided handles so edges can attach from any direction.
 *
 * Visual surface:
 *  - Left accent bar: per-card colour override or type colour.
 *  - Top-left type pill: emoji (icon override > type emoji) + label.
 *  - Top-right status dot: from Card.metadata.status.
 *  - Bottom-right priority bars: 1/2/3 vertical strokes from
 *    Card.metadata.priority.
 *  - Selected ring: 2-px accent ring + offset.
 */
export function CardNode({ data, selected }: NodeProps): JSX.Element {
  const card = (data as CardNodeData).card;
  const tone = CARD_TYPE_STYLES[card.type].tone;
  const resolved = resolveCardStyle(card);
  const status = getCardStatus(card);
  const priority = getCardPriority(card);
  const statusDef = status ? STATUS_OPTIONS.find((s) => s.value === status) : null;
  const priorityDef = priority ? PRIORITY_OPTIONS.find((p) => p.value === priority) : null;

  return (
    <div
      className={[
        "group relative w-[220px] overflow-hidden rounded-2xl border bg-gradient-to-br p-3 pl-4 shadow-lg shadow-black/40 backdrop-blur-md transition",
        tone,
      ].join(" ")}
      style={
        selected
          ? {
              boxShadow: `0 0 0 2px ${resolved.accent}99, 0 12px 30px -12px ${resolved.accent}80`,
            }
          : undefined
      }
    >
      {/* Accent left bar */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-1"
        style={{ background: resolved.accent }}
      />

      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest opacity-90">
          <span>{resolved.emoji}</span>
          <span>{resolved.label}</span>
        </span>
        {statusDef && (
          <span
            className="inline-flex items-center gap-1 text-[10px] opacity-90"
            title={`Status: ${statusDef.label}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: statusDef.color }}
            />
          </span>
        )}
      </div>

      <div className="line-clamp-2 text-sm font-semibold leading-snug">{card.title}</div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-snug opacity-75">
        {flattenBody(card)}
      </div>

      {priorityDef && (
        <div
          className="absolute bottom-2 right-2 flex items-end gap-[2px]"
          title={`Priority: ${priorityDef.label}`}
        >
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="block w-[3px] rounded-sm transition"
              style={{
                height: 4 + i * 3,
                background: i <= priorityDef.bars ? priorityDef.color : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>
      )}

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
