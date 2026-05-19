import { useViewport } from "@xyflow/react";
import type { Guide } from "./snapEngine.js";

/**
 * Overlay that draws alignment guides during a drag. Must be rendered
 * inside `<ReactFlowProvider>` so it can read the live viewport
 * transform via `useViewport()` and convert flow coords to screen
 * coords without a re-render storm.
 */
export function SnapGuideOverlay({ guides }: { guides: Guide[] }): JSX.Element | null {
  const { x: vx, y: vy, zoom } = useViewport();
  if (guides.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[9]"
      width="100%"
      height="100%"
    >
      {guides.map((g, i) => {
        if (g.axis === "x") {
          // Vertical line at flow x = g.position, spanning flow ys.
          const screenX = g.position * zoom + vx;
          const y1 = g.start * zoom + vy;
          const y2 = g.end * zoom + vy;
          return (
            <line
              key={`gx-${i}-${g.position}`}
              x1={screenX}
              x2={screenX}
              y1={y1}
              y2={y2}
              stroke="#ff3d83"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          );
        }
        // Horizontal line at flow y = g.position, spanning flow xs.
        const screenY = g.position * zoom + vy;
        const x1 = g.start * zoom + vx;
        const x2 = g.end * zoom + vx;
        return (
          <line
            key={`gy-${i}-${g.position}`}
            x1={x1}
            x2={x2}
            y1={screenY}
            y2={screenY}
            stroke="#ff3d83"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
