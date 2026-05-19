import { useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  useNodes,
  type EdgeProps,
  type Node,
} from "@xyflow/react";
import type { EdgeDescription } from "@chitra/core";
import { routeAvoid } from "./routeAvoid.js";

/**
 * Data attached to every Chitra edge after the domain → React Flow
 * mapping (see Canvas.tsx `rfEdges`). Keeping this typed here lets the
 * edge renderer pull description/label info without re-resolving styles.
 */
export interface ChitraEdgeData extends Record<string, unknown> {
  shape: "straight" | "smoothstep" | "step" | "bezier" | "avoid";
  stroke: string;
  /** Centre-pill text (from `BoardEdge.label`). */
  label?: string;
  description?: EdgeDescription;
  secondaryLabel?: EdgeDescription;
}

/**
 * One edge component that renders all four supported shapes and floats
 * up to three labels above/center/below the midline. We compute the path
 * ourselves (instead of relying on RF's built-in edge components) so
 * `EdgeLabelRenderer` can place pills along the real geometry.
 *
 * Why not the built-in types?
 *   - Built-in `straight|smoothstep|step|default` edges render labels
 *     inside the SVG `<text>` which cannot be styled with HTML pills
 *     and cannot be placed at a user-chosen `t` along the curve.
 *   - We need three independent label slots (centre label + description
 *     + secondary label) per edge.
 */
export function ChitraEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  data,
  style,
  markerEnd,
  markerStart,
  selected,
}: EdgeProps): JSX.Element {
  const d = (data ?? {}) as ChitraEdgeData;
  const shape = d.shape ?? "smoothstep";

  // For avoid routing we need every other node's bbox. `useNodes()`
  // returns the live array; React Flow re-renders the edge whenever any
  // node moves so the route stays current.
  const allNodes = useNodes<Node>();

  const [path, labelX, labelY] = useMemo(() => {
    const sp = sourcePosition ?? Position.Bottom;
    const tp = targetPosition ?? Position.Top;
    switch (shape) {
      case "avoid": {
        const obstacles = allNodes
          .filter((n) => n.id !== source && n.id !== target)
          .map((n) => ({
            x: n.position.x,
            y: n.position.y,
            w: n.width ?? 220,
            h: n.height ?? 120,
          }));
        const r = routeAvoid({
          source: { x: sourceX, y: sourceY },
          target: { x: targetX, y: targetY },
          obstacles,
        });
        const mid = r.points[Math.floor(r.points.length / 2)] ?? {
          x: (sourceX + targetX) / 2,
          y: (sourceY + targetY) / 2,
        };
        return [r.path, mid.x, mid.y] as [string, number, number];
      }
      case "straight":
        return getStraightPath({ sourceX, sourceY, targetX, targetY });
      case "step":
        return getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition: sp,
          targetPosition: tp,
          borderRadius: 0,
        });
      case "bezier":
        return getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition: sp,
          targetPosition: tp,
        });
      case "smoothstep":
      default:
        return getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition: sp,
          targetPosition: tp,
        });
    }
  }, [shape, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, allNodes, source, target]);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={28}
      />
      <EdgeLabelRenderer>
        {d.label && (
          <LabelPill
            x={labelX}
            y={labelY}
            text={d.label}
            color={d.stroke}
            background="solid"
            offset={0}
            selected={selected}
          />
        )}
        {d.description?.text && (
          <LabelPill
            x={labelX}
            y={labelY}
            text={d.description.text}
            color={d.description.color ?? d.stroke}
            background={d.description.background}
            offset={placementOffset(d.description.placement)}
            tOffsetX={tToDelta(d.description.t, targetX - sourceX)}
            tOffsetY={tToDelta(d.description.t, targetY - sourceY)}
            selected={selected}
          />
        )}
        {d.secondaryLabel?.text && (
          <LabelPill
            x={labelX}
            y={labelY}
            text={d.secondaryLabel.text}
            color={d.secondaryLabel.color ?? d.stroke}
            background={d.secondaryLabel.background}
            offset={placementOffset(d.secondaryLabel.placement)}
            tOffsetX={tToDelta(d.secondaryLabel.t, targetX - sourceX)}
            tOffsetY={tToDelta(d.secondaryLabel.t, targetY - sourceY)}
            selected={selected}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}

/** Pixels to move perpendicular to the line. Positive = "below", in
 *  screen-space (down). */
function placementOffset(placement: "above" | "center" | "below"): number {
  if (placement === "above") return -16;
  if (placement === "below") return 16;
  return 0;
}

/** Convert a 0..1 `t` along the line into a pixel delta along that axis,
 *  relative to the midpoint (which `labelX/labelY` already represents).
 *  `t === undefined` → 0 offset (sit at midpoint). */
function tToDelta(t: number | undefined, fullDelta: number): number {
  if (t === undefined) return 0;
  // labelX/labelY are the midpoint (t = 0.5), so shift by (t - 0.5).
  return (t - 0.5) * fullDelta;
}

function LabelPill({
  x,
  y,
  text,
  color,
  background,
  offset,
  tOffsetX = 0,
  tOffsetY = 0,
  selected,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  background: "solid" | "outline" | "none";
  offset: number;
  tOffsetX?: number;
  tOffsetY?: number;
  selected?: boolean;
}): JSX.Element {
  const cx = x + tOffsetX;
  const cy = y + offset + tOffsetY;
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    transform: `translate(-50%, -50%) translate(${cx}px, ${cy}px)`,
    pointerEvents: "all",
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
    padding: "3px 6px",
    borderRadius: 6,
    whiteSpace: "nowrap",
    color: background === "solid" ? "#fff" : color,
    background:
      background === "solid"
        ? "rgba(11,11,16,0.92)"
        : background === "outline"
          ? "rgba(11,11,16,0.75)"
          : "transparent",
    border:
      background === "none"
        ? "none"
        : `1px solid ${selected ? color : "rgba(255,255,255,0.12)"}`,
    backdropFilter: background === "none" ? undefined : "blur(4px)",
    boxShadow: selected ? `0 0 0 1px ${color}55` : undefined,
  };
  return (
    <div className="nodrag nopan" style={baseStyle} title={text}>
      {text}
    </div>
  );
}
