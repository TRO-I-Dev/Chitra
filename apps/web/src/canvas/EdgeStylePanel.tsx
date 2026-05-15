import { useMemo } from "react";
import type { EdgeDash, EdgeShape } from "@chitra/core";
import { useCurrentBoard, useProjectStore } from "../state/projectStore.js";
import {
  EDGE_COLORS,
  EDGE_DASHES,
  EDGE_KINDS,
  EDGE_SHAPES,
  EDGE_STYLES,
  resolveEdgeStyle,
} from "./edgeStyles.js";

const WIDTH_PRESETS: { label: string; value: number }[] = [
  { label: "Thin", value: 1 },
  { label: "Normal", value: 1.5 },
  { label: "Bold", value: 2.5 },
  { label: "Heavy", value: 4 },
];

/**
 * Floating editor for the currently selected connector. Lives at the
 * bottom-center of the canvas; controls shape, color, thickness, dash
 * pattern, animation, and label.
 */
export function EdgeStylePanel({
  edgeId,
  onClose,
}: {
  edgeId: string;
  onClose: () => void;
}): JSX.Element | null {
  const board = useCurrentBoard();
  const updateEdge = useProjectStore((s) => s.updateEdge);
  const removeEdge = useProjectStore((s) => s.removeEdge);

  const edge = useMemo(
    () => board?.edges.find((e) => e.id === edgeId) ?? null,
    [board, edgeId],
  );

  if (!edge) return null;

  const resolved = resolveEdgeStyle(edge.kind, edge.style);
  const ov = edge.style ?? {};

  function patchStyle(patch: Partial<NonNullable<typeof edge.style>>): void {
    updateEdge(edgeId, { style: patch });
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-[min(960px,96vw)] flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0d0d14]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
        {/* Drag-handle / title */}
        <div className="flex items-center gap-2 pr-2">
          <span
            aria-hidden="true"
            className="inline-block h-[3px] w-5 rounded-full"
            style={{
              background: resolved.stroke,
              opacity: 0.9,
              ...(resolved.dasharray
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${resolved.stroke} 0 4px, transparent 4px 7px)`,
                    background: "transparent",
                  }
                : {}),
            }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
            Connector
          </span>
        </div>

        {/* Semantic kind */}
        <Group label="Type">
          <select
            value={edge.kind}
            onChange={(e) =>
              updateEdge(edgeId, { kind: e.target.value as (typeof EDGE_KINDS)[number] })
            }
            className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-[var(--color-ink)] outline-none focus:border-white/30"
          >
            {EDGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EDGE_STYLES[k].label}
              </option>
            ))}
          </select>
        </Group>

        {/* Shape */}
        <Group label="Shape">
          <ChipRow>
            {EDGE_SHAPES.map((s) => (
              <Chip
                key={s.value}
                active={resolved.shape === s.value}
                onClick={() => patchStyle({ shape: s.value as EdgeShape })}
                title={s.label}
              >
                <span className="text-sm leading-none">{s.glyph}</span>
              </Chip>
            ))}
          </ChipRow>
        </Group>

        {/* Color */}
        <Group label="Color">
          <ChipRow>
            {EDGE_COLORS.map((c) => {
              const active = (ov.stroke ?? null) === c.value;
              return (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  onClick={() =>
                    patchStyle(c.value === null ? { stroke: undefined } : { stroke: c.value })
                  }
                  className={[
                    "relative grid h-5 w-5 place-items-center rounded-full border transition",
                    active
                      ? "border-white/60 ring-1 ring-white/30"
                      : "border-white/15 hover:border-white/40",
                  ].join(" ")}
                  style={
                    c.value === null
                      ? {
                          background:
                            "conic-gradient(from 0deg, #94a3b8, #7c5cff, #21d4fd, #34d399, #fbbf24, #fb7185, #94a3b8)",
                        }
                      : { background: c.value }
                  }
                >
                  {c.value === null && (
                    <span className="absolute inset-0 grid place-items-center text-[8px] font-bold text-black/80">
                      A
                    </span>
                  )}
                </button>
              );
            })}
          </ChipRow>
        </Group>

        {/* Width */}
        <Group label="Width">
          <ChipRow>
            {WIDTH_PRESETS.map((w) => (
              <Chip
                key={w.label}
                active={Math.abs(resolved.strokeWidth - w.value) < 0.01}
                onClick={() => patchStyle({ strokeWidth: w.value })}
                title={`${w.label} (${w.value}px)`}
              >
                <span
                  className="inline-block w-4 rounded-full"
                  style={{
                    height: Math.max(1, w.value),
                    background: resolved.stroke,
                  }}
                />
              </Chip>
            ))}
          </ChipRow>
        </Group>

        {/* Dash */}
        <Group label="Dash">
          <ChipRow>
            {EDGE_DASHES.map((d) => (
              <Chip
                key={d.value}
                active={(ov.dash ?? "solid") === d.value}
                onClick={() => patchStyle({ dash: d.value as EdgeDash })}
                title={d.label}
              >
                <span className="leading-none">{d.label}</span>
              </Chip>
            ))}
          </ChipRow>
        </Group>

        {/* Animated */}
        <Group label="Flow">
          <Chip
            active={resolved.animated}
            onClick={() => patchStyle({ animated: !resolved.animated })}
            title="Toggle animated dashes"
          >
            <span className="leading-none">{resolved.animated ? "On" : "Off"}</span>
          </Chip>
        </Group>

        {/* Label */}
        <Group label="Label">
          <input
            value={edge.label ?? ""}
            placeholder={EDGE_STYLES[edge.kind].label}
            onChange={(e) => updateEdge(edgeId, { label: e.target.value })}
            className="w-28 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-dim)]/50 focus:border-white/30"
          />
        </Group>

        {/* Reset / delete / close */}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <button
            type="button"
            onClick={() => updateEdge(edgeId, { style: null, label: "" })}
            title="Reset to defaults"
            className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              removeEdge(edgeId);
              onClose();
            }}
            title="Delete connector"
            className="rounded-md px-2 py-1 text-[11px] text-rose-300/90 transition hover:bg-rose-400/10 hover:text-rose-200"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close connector editor"
            className="rounded-md px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 border-l border-white/5 pl-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-dim)]/80">
        {label}
      </span>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "grid h-6 min-w-[26px] place-items-center rounded-md border px-1.5 text-[10px] transition",
        active
          ? "border-white/30 bg-white/10 text-[var(--color-ink)]"
          : "border-white/5 text-[var(--color-ink-dim)] hover:border-white/15 hover:bg-white/5 hover:text-[var(--color-ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
