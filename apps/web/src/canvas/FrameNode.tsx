import { memo, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "../state/projectStore.js";

interface FrameData {
  cardId: string;
  /** Frame title, mirrored from the stub card. */
  title: string;
  /** Optional accent colour (CSS hex). */
  color?: string;
  selected?: boolean;
}

/**
 * Frame node: a titled rectangle that visually groups other nodes.
 * Children aren't reparented automatically — frames are spatial hints.
 * Resize via the standard NodeResizer; title is inline-editable.
 */
function FrameNodeImpl({ id, data, selected }: NodeProps): JSX.Element {
  const d = data as unknown as FrameData;
  const updateCard = useProjectStore((s) => s.updateCard);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.title);

  const commit = (): void => {
    setEditing(false);
    if (draft.trim() && draft !== d.title) {
      updateCard(d.cardId, { title: draft.trim() });
    } else {
      setDraft(d.title);
    }
  };

  const accent = d.color ?? "#7c5cff";

  return (
    <div
      className="relative h-full w-full rounded-2xl"
      style={{
        border: `1.5px dashed ${accent}`,
        background: `${accent}10`,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={100}
        lineStyle={{ borderColor: accent }}
        handleStyle={{ background: accent, border: "none", width: 8, height: 8 }}
      />
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className="absolute -top-3 left-3 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ background: "var(--color-surface)", color: accent }}
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(d.title); setEditing(false); }
            }}
            className="rounded bg-transparent px-1 text-[11px] outline-none ring-1 ring-white/20"
          />
        ) : (
          <span title="Double-click to rename">{d.title || "Frame"}</span>
        )}
      </div>
    </div>
  );
}

export const FrameNode = memo(FrameNodeImpl);
