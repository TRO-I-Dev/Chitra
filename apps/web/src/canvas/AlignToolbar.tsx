import type { BoardNode } from "@chitra/core";

/**
 * Floating alignment / distribute toolbar — appears at top-centre of
 * the canvas when 2+ nodes are selected. Operates purely on positions
 * (and persisted width/height), then delegates the actual mutation to
 * the caller via `onApply`.
 */
export type AlignAction =
  | "align-left"
  | "align-center-x"
  | "align-right"
  | "align-top"
  | "align-center-y"
  | "align-bottom"
  | "distribute-h"
  | "distribute-v";

const DEFAULT_W = 220;
const DEFAULT_H = 120;

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function toRects(nodes: BoardNode[]): Rect[] {
  return nodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: n.width ?? DEFAULT_W,
    h: n.height ?? DEFAULT_H,
  }));
}

/** Pure function: given the full domain nodes + the subset of selected
 *  ids + an action, returns the next nodes array with updated
 *  positions. Non-selected nodes are returned unchanged. */
export function applyAlignment(
  allNodes: BoardNode[],
  selectedIds: Set<string>,
  action: AlignAction,
): BoardNode[] {
  if (selectedIds.size < 2) return allNodes;
  const selected = allNodes.filter((n) => selectedIds.has(n.id));
  const rects = toRects(selected);

  const newXById = new Map<string, number>();
  const newYById = new Map<string, number>();

  switch (action) {
    case "align-left": {
      const minX = Math.min(...rects.map((r) => r.x));
      rects.forEach((r) => newXById.set(r.id, minX));
      break;
    }
    case "align-right": {
      const maxRight = Math.max(...rects.map((r) => r.x + r.w));
      rects.forEach((r) => newXById.set(r.id, maxRight - r.w));
      break;
    }
    case "align-center-x": {
      const centers = rects.map((r) => r.x + r.w / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      rects.forEach((r) => newXById.set(r.id, avg - r.w / 2));
      break;
    }
    case "align-top": {
      const minY = Math.min(...rects.map((r) => r.y));
      rects.forEach((r) => newYById.set(r.id, minY));
      break;
    }
    case "align-bottom": {
      const maxBot = Math.max(...rects.map((r) => r.y + r.h));
      rects.forEach((r) => newYById.set(r.id, maxBot - r.h));
      break;
    }
    case "align-center-y": {
      const centers = rects.map((r) => r.y + r.h / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      rects.forEach((r) => newYById.set(r.id, avg - r.h / 2));
      break;
    }
    case "distribute-h": {
      if (rects.length < 3) break;
      const sorted = [...rects].sort((a, b) => a.x - b.x);
      const left = sorted[0]!.x;
      const right = sorted[sorted.length - 1]!.x;
      const totalW = sorted.reduce((sum, r) => sum + r.w, 0);
      const gap = (right + sorted[sorted.length - 1]!.w - left - totalW) /
        (sorted.length - 1);
      let cursor = left;
      for (const r of sorted) {
        newXById.set(r.id, cursor);
        cursor += r.w + gap;
      }
      break;
    }
    case "distribute-v": {
      if (rects.length < 3) break;
      const sorted = [...rects].sort((a, b) => a.y - b.y);
      const top = sorted[0]!.y;
      const bot = sorted[sorted.length - 1]!.y;
      const totalH = sorted.reduce((sum, r) => sum + r.h, 0);
      const gap = (bot + sorted[sorted.length - 1]!.h - top - totalH) /
        (sorted.length - 1);
      let cursor = top;
      for (const r of sorted) {
        newYById.set(r.id, cursor);
        cursor += r.h + gap;
      }
      break;
    }
  }

  return allNodes.map((n) => {
    if (!selectedIds.has(n.id)) return n;
    const nx = newXById.get(n.id);
    const ny = newYById.get(n.id);
    if (nx === undefined && ny === undefined) return n;
    return {
      ...n,
      position: {
        x: nx ?? n.position.x,
        y: ny ?? n.position.y,
      },
    };
  });
}

/** Apply a delta to every selected node's position. Used for arrow-key
 *  nudges (1px) and shift+arrow (10px). */
export function nudgeNodes(
  allNodes: BoardNode[],
  selectedIds: Set<string>,
  dx: number,
  dy: number,
): BoardNode[] {
  if (selectedIds.size === 0 || (dx === 0 && dy === 0)) return allNodes;
  return allNodes.map((n) =>
    selectedIds.has(n.id)
      ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      : n,
  );
}

/* ------------------------------------------------------------------ *
 *  Toolbar UI                                                          *
 * ------------------------------------------------------------------ */

export function AlignToolbar({
  count,
  onAction,
}: {
  count: number;
  onAction: (action: AlignAction) => void;
}): JSX.Element | null {
  if (count < 2) return null;
  const distributable = count >= 3;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-20 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#0d0d14]/95 px-1.5 py-1 text-xs shadow-2xl backdrop-blur-md">
        <span className="px-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
          {count} selected
        </span>
        <Divider />
        <Btn title="Align left edges" onClick={() => onAction("align-left")} glyph="L|" />
        <Btn title="Align horizontal centres" onClick={() => onAction("align-center-x")} glyph="|C|" />
        <Btn title="Align right edges" onClick={() => onAction("align-right")} glyph="|R" />
        <Divider />
        <Btn title="Align top edges" onClick={() => onAction("align-top")} glyph="T̄" />
        <Btn title="Align vertical centres" onClick={() => onAction("align-center-y")} glyph="C̄" />
        <Btn title="Align bottom edges" onClick={() => onAction("align-bottom")} glyph="B̲" />
        <Divider />
        <Btn
          title="Distribute horizontally (3+ nodes)"
          onClick={() => onAction("distribute-h")}
          glyph="≡↔"
          disabled={!distributable}
        />
        <Btn
          title="Distribute vertically (3+ nodes)"
          onClick={() => onAction("distribute-v")}
          glyph="≡↕"
          disabled={!distributable}
        />
      </div>
    </div>
  );
}

function Btn({
  title,
  onClick,
  glyph,
  disabled,
}: {
  title: string;
  onClick: () => void;
  glyph: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-2 py-0.5 font-mono text-[11px] transition",
        disabled
          ? "text-[var(--color-ink-dim)]/40"
          : "text-[var(--color-ink-dim)] hover:bg-white/10 hover:text-[var(--color-ink)]",
      ].join(" ")}
    >
      {glyph}
    </button>
  );
}

function Divider(): JSX.Element {
  return <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />;
}
