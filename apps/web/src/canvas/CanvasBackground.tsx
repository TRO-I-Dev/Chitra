import type { BoardBackground } from "@chitra/core";
import { StudioBackground } from "./StudioBackground.js";
import { resolveBackground } from "./backgroundPalettes.js";

/**
 * Render layer for the canvas background. Lives below React Flow and
 * never captures pointer events.
 *
 * The `studio` kind keeps the existing animated Konva blob wash; every
 * other kind is a pure-CSS layer painted onto a single absolutely
 * positioned div so we don't pay for an extra canvas.
 */
export function CanvasBackground({
  background,
}: {
  background: BoardBackground | undefined;
}): JSX.Element {
  const bg = resolveBackground(background);

  if (bg.kind === "studio") {
    return <StudioBackground enabled />;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: bg.color,
    opacity: bg.opacity ?? 1,
    zIndex: 0,
  };

  let pattern: React.CSSProperties | null = null;
  const size = bg.size ?? 22;
  const accent = bg.accent ?? "rgba(255,255,255,0.07)";
  const angle = bg.angle ?? 30;

  switch (bg.kind) {
    case "solid":
      // Just the base colour — no overlay.
      break;
    case "dots": {
      pattern = {
        backgroundImage: `radial-gradient(${accent} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      };
      break;
    }
    case "grid": {
      pattern = {
        backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      };
      break;
    }
    case "lines": {
      pattern = {
        backgroundImage: `linear-gradient(${accent} 1px, transparent 1px)`,
        backgroundSize: `100% ${size}px`,
      };
      break;
    }
    case "iso": {
      // Three sets of 60°-rotated lines give an isometric grid feel.
      pattern = {
        backgroundImage: [
          `linear-gradient(${angle}deg, ${accent} 1px, transparent 1px)`,
          `linear-gradient(${-angle}deg, ${accent} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
        ].join(", "),
        backgroundSize: `${size}px ${size}px`,
      };
      break;
    }
    case "gradient": {
      style.background = `linear-gradient(${angle}deg, ${bg.color}, ${accent})`;
      if (bg.blur) style.filter = `blur(${bg.blur}px)`;
      break;
    }
    case "image": {
      if (bg.imageUrl) {
        style.backgroundImage = `url(${bg.imageUrl})`;
        style.backgroundSize = "cover";
        style.backgroundPosition = "center";
        if (bg.blur) style.filter = `blur(${bg.blur}px)`;
      }
      break;
    }
  }

  return (
    <>
      <div style={style} aria-hidden />
      {pattern && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            opacity: bg.opacity ?? 1,
            ...pattern,
          }}
        />
      )}
    </>
  );
}
