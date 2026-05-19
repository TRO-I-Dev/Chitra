import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
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
  /** Persisted width (px) — drives both the wrapper size and the
   *  NodeResizer initial value so resize doesn't snap back on rerender. */
  width?: number;
  /** Persisted height; when undefined the card auto-sizes to content. */
  height?: number;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 600;

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
 *  - User-resizable via `<NodeResizer>` (visible on selection). Width
 *    persists to `BoardNode.width/height`; clearing them reverts to
 *    auto-size.
 */
export function CardNode({ data, selected }: NodeProps): JSX.Element {
  const { card, width, height } = data as CardNodeData;
  const tone = CARD_TYPE_STYLES[card.type].tone;
  const resolved = resolveCardStyle(card);
  const status = getCardStatus(card);
  const priority = getCardPriority(card);
  const statusDef = status ? STATUS_OPTIONS.find((s) => s.value === status) : null;
  const priorityDef = priority ? PRIORITY_OPTIONS.find((p) => p.value === priority) : null;

  // Default visible footprint when no override is set.
  const w = width ?? 220;
  const h = height; // undefined → auto

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={MIN_WIDTH}
        maxWidth={MAX_WIDTH}
        minHeight={MIN_HEIGHT}
        maxHeight={MAX_HEIGHT}
        lineStyle={{ borderColor: resolved.accent, borderWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: resolved.accent,
          border: "1px solid rgba(255,255,255,0.5)",
        }}
      />
      <div
        className={[
          "group relative overflow-hidden p-3 pl-4 backdrop-blur-md transition",
          // Only apply the type's gradient/tone when no custom surface bg
          // override is set; otherwise the override would be invisible
          // beneath Tailwind's `bg-gradient-to-br` utility classes.
          resolved.surface?.background
            ? "border"
            : "border bg-gradient-to-br shadow-lg shadow-black/40 " + tone,
        ].join(" ")}
        style={{
          width: w,
          ...(h ? { height: h } : {}),
          // Default rounded-2xl (16px) when no override.
          borderRadius: resolved.surface?.borderRadius ?? 16,
          // Spread overrides last so they win over defaults but before the
          // selection ring (which always takes precedence visually).
          ...(resolved.surface ?? {}),
          ...(selected
            ? {
                boxShadow: `0 0 0 2px ${resolved.accent}99, 0 12px 30px -12px ${resolved.accent}80`,
              }
            : {}),
        }}
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
    </>
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
