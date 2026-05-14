import type { CSSProperties } from "react";

/**
 * Chitra brand mark — a stylised "C" arc with two endpoint nodes and a
 * connecting accent dot. Pure SVG, currentColor-aware via the gradient stops
 * which read CSS variables `--color-accent` (#7c5cff) and `--color-accent-2`
 * (#21d4fd).
 *
 * Designed to be inlined wherever the app needs a piece of brand identity
 * (Welcome hero, Workspace title bar, Onboarding splash, About dialog). The
 * `idPrefix` prop avoids `<defs>` id collisions when more than one mark
 * appears on the same page.
 */
export function LogoMark({
  size = 28,
  className,
  glow = false,
  idPrefix = "chitra-mark",
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  idPrefix?: string;
}): JSX.Element {
  const gradId = `${idPrefix}-grad`;
  const glowId = `${idPrefix}-glow`;
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Chitra"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent, #7c5cff)" />
          <stop offset="100%" stopColor="var(--color-accent-2, #21d4fd)" />
        </linearGradient>
        {glow && (
          <radialGradient id={glowId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="var(--color-accent-2, #21d4fd)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-accent-2, #21d4fd)" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {glow && <circle cx="128" cy="128" r="120" fill={`url(#${glowId})`} />}
      <path
        d="M 188 78 A 60 60 0 1 0 188 178"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="22"
        strokeLinecap="round"
      />
      <circle cx="188" cy="78" r="10" fill="var(--color-accent-2, #21d4fd)" />
      <circle cx="188" cy="178" r="10" fill="var(--color-accent, #7c5cff)" />
      <circle cx="68" cy="128" r="6" fill="var(--color-accent, #7c5cff)" opacity="0.7" />
    </svg>
  );
}

/**
 * "Chitra" wordmark. Set in the display font (Inter Display via CSS var).
 * The `h` is tinted with the accent for a tiny but recognisable signature.
 */
export function Wordmark({
  size = "md",
  className,
  style,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const sizeClass = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-3xl",
    xl: "text-5xl",
  }[size];
  return (
    <span
      className={[
        "select-none font-semibold tracking-tight",
        sizeClass,
        className ?? "",
      ].join(" ")}
      style={{ fontFamily: "var(--font-display, Inter, ui-sans-serif)", ...style }}
    >
      <span>C</span>
      <span
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--color-accent, #7c5cff), var(--color-accent-2, #21d4fd))",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        h
      </span>
      <span>itra</span>
    </span>
  );
}

/**
 * Mark + wordmark side-by-side. Optional tagline below.
 */
export function LogoLockup({
  markSize = 28,
  wordSize = "md",
  tagline,
  className,
  glow = false,
}: {
  markSize?: number;
  wordSize?: "sm" | "md" | "lg" | "xl";
  tagline?: string;
  className?: string;
  glow?: boolean;
}): JSX.Element {
  return (
    <div className={["flex items-center gap-2.5", className ?? ""].join(" ")}>
      <LogoMark size={markSize} glow={glow} />
      <div className="flex flex-col leading-none">
        <Wordmark size={wordSize} />
        {tagline && (
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
}
