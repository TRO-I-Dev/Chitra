import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Circle, Rect } from "react-konva";
import type Konva from "konva";

interface Blob {
  cx: number;
  cy: number;
  r: number;
  hue: number;
  sat: number;
  light: number;
  alpha: number;
  driftX: number;
  driftY: number;
  phase: number;
  speed: number;
}

const BLOBS: Omit<Blob, "cx" | "cy">[] = [
  { r: 380, hue: 264, sat: 95, light: 62, alpha: 0.22, driftX: 90, driftY: 60, phase: 0, speed: 0.00012 },
  { r: 460, hue: 192, sat: 95, light: 60, alpha: 0.18, driftX: 110, driftY: 80, phase: 1.4, speed: 0.00009 },
  { r: 320, hue: 320, sat: 90, light: 65, alpha: 0.14, driftX: 80, driftY: 120, phase: 2.7, speed: 0.00014 },
  { r: 280, hue: 168, sat: 80, light: 60, alpha: 0.12, driftX: 70, driftY: 70, phase: 4.1, speed: 0.00011 },
];

/**
 * Decorative animated background. Sits below React Flow with `pointer-events:
 * none` so it never steals interactions. Pauses entirely when the window is
 * hidden to save battery.
 */
export function StudioBackground({ enabled = true }: { enabled?: boolean }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const blobs = useMemo<Blob[]>(() => {
    if (size.w === 0) return [];
    return BLOBS.map((b, i) => ({
      ...b,
      cx: ((i * 0.27 + 0.15) % 1) * size.w,
      cy: ((i * 0.41 + 0.2) % 1) * size.h,
    }));
  }, [size]);

  // Animation loop via requestAnimationFrame (paused when tab hidden / disabled).
  useEffect(() => {
    if (!enabled || size.w === 0) return;
    let raf = 0;
    let lastDraw = 0;
    const step = (ts: number) => {
      if (document.visibilityState === "visible" && ts - lastDraw > 33) {
        const stage = stageRef.current;
        if (stage) {
          const layer = stage.getLayers()[0];
          if (layer) {
            const circles = layer.find<Konva.Circle>("Circle");
            circles.forEach((node, i) => {
              const b = blobs[i];
              if (!b) return;
              const t = ts * b.speed + b.phase;
              node.x(b.cx + Math.sin(t) * b.driftX);
              node.y(b.cy + Math.cos(t * 1.13) * b.driftY);
            });
            layer.batchDraw();
          }
        }
        lastDraw = ts;
      }
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [enabled, blobs, size]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ background: "#0b0b10" }}
    >
      {size.w > 0 && (
        <Stage ref={stageRef} width={size.w} height={size.h} listening={false}>
          <Layer listening={false}>
            {blobs.map((b, i) => (
              <Circle
                key={i}
                x={b.cx}
                y={b.cy}
                radius={b.r}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={b.r}
                fillRadialGradientColorStops={[
                  0,
                  `hsla(${b.hue}, ${b.sat}%, ${b.light}%, ${b.alpha})`,
                  1,
                  `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0)`,
                ]}
                opacity={enabled ? 1 : 0}
              />
            ))}
            {/* Subtle vignette to ground the canvas */}
            <Rect
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              fillRadialGradientStartPoint={{ x: size.w / 2, y: size.h / 2 }}
              fillRadialGradientStartRadius={Math.min(size.w, size.h) * 0.35}
              fillRadialGradientEndPoint={{ x: size.w / 2, y: size.h / 2 }}
              fillRadialGradientEndRadius={Math.max(size.w, size.h) * 0.7}
              fillRadialGradientColorStops={[0, "rgba(0,0,0,0)", 1, "rgba(0,0,0,0.55)"]}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
