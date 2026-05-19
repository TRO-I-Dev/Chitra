import { useState } from "react";
import type { BackgroundKind } from "@chitra/core";
import { useCurrentBoard, useProjectStore } from "../state/projectStore.js";
import {
  BACKGROUND_KINDS,
  BACKGROUND_PALETTES,
  applyPalette,
  resolveBackground,
} from "./backgroundPalettes.js";

const ACCENT_SWATCHES = [
  "#7c5cff", "#21d4fd", "#34d399", "#fbbf24",
  "#fb7185", "#38bdf8", "#e879f9", "#94a3b8",
  "#ffffff", "#1f2937",
];

/** Soft warn / hard cap for image-kind backgrounds embedded in `.chitra`. */
const SOFT_WARN_BYTES = 5 * 1024 * 1024;
const HARD_CAP_BYTES = 25 * 1024 * 1024;

/**
 * Floating panel that edits the current board's background. Opens from
 * the canvas top-bar Background button. Persists to `Board.background`
 * so the look round-trips through `.chitra` save/load.
 */
export function BackgroundPanel({ onClose }: { onClose: () => void }): JSX.Element | null {
  const board = useCurrentBoard();
  const updateBoardBackground = useProjectStore((s) => s.updateBoardBackground);
  const [error, setError] = useState<string | null>(null);

  if (!board) return null;
  const bg = resolveBackground(board.background);

  function applyKind(kind: BackgroundKind): void {
    updateBoardBackground({ kind });
  }

  function applyPaletteId(id: string): void {
    const merged = applyPalette(board?.background, id);
    updateBoardBackground(merged);
  }

  async function handleImageUpload(file: File): Promise<void> {
    if (file.size > HARD_CAP_BYTES) {
      setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Hard cap is 25MB.`);
      return;
    }
    if (file.size > SOFT_WARN_BYTES) {
      setError(`Warning: ${(file.size / 1024 / 1024).toFixed(1)}MB image will bloat your .chitra file.`);
    } else {
      setError(null);
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    updateBoardBackground({ kind: "image", imageUrl: dataUrl });
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(640px,96vw)] rounded-2xl border border-white/10 bg-[#0d0d14]/95 p-4 text-xs shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
              Canvas background
            </span>
            <span className="text-[10px] text-[var(--color-ink-dim)]/70">
              · {board.name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateBoardBackground(null)}
              className="rounded-md px-2 py-1 text-[10px] text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
              title="Reset to default"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close background editor"
              className="rounded-md px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Palettes */}
        <Section title="Palette">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-6">
            {BACKGROUND_PALETTES.map((p) => {
              const active = bg.palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPaletteId(p.id)}
                  title={p.label}
                  className={[
                    "group relative flex flex-col items-stretch overflow-hidden rounded-lg border text-left transition",
                    active
                      ? "border-white/40 ring-1 ring-white/20"
                      : "border-white/10 hover:border-white/25",
                  ].join(" ")}
                >
                  <div
                    className="h-10 w-full"
                    style={{
                      background: p.swatch
                        ? `linear-gradient(135deg, ${p.color}, ${p.swatch})`
                        : p.color,
                    }}
                  />
                  <div className="flex items-center justify-between bg-black/40 px-1.5 py-1">
                    <span className="truncate text-[9px] uppercase tracking-wider opacity-80">
                      {p.label}
                    </span>
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: p.accent }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Kind */}
        <Section title="Style">
          <div className="flex flex-wrap gap-1">
            {BACKGROUND_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => applyKind(k.value)}
                className={[
                  "rounded-md border px-2 py-1 text-[10px] transition",
                  bg.kind === k.value
                    ? "border-white/40 bg-white/10 text-[var(--color-ink)]"
                    : "border-white/10 text-[var(--color-ink-dim)] hover:border-white/25 hover:bg-white/5",
                ].join(" ")}
              >
                {k.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Colors */}
        <Section title="Colours">
          <div className="flex items-center gap-3">
            <ColorField
              label="Base"
              value={bg.color ?? "#0b0b10"}
              onChange={(v) => updateBoardBackground({ color: v })}
            />
            <ColorField
              label="Accent"
              value={bg.accent ?? "#7c5cff"}
              onChange={(v) => updateBoardBackground({ accent: v })}
            />
            <div className="flex flex-wrap items-center gap-1">
              {ACCENT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => updateBoardBackground({ accent: c })}
                  className={[
                    "h-5 w-5 rounded-full border",
                    bg.accent === c ? "border-white/60 ring-1 ring-white/30" : "border-white/15 hover:border-white/40",
                  ].join(" ")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* Numeric sliders — only relevant for some kinds. */}
        {(bg.kind === "dots" || bg.kind === "grid" || bg.kind === "lines" || bg.kind === "iso") && (
          <Section title="Spacing">
            <Slider
              min={6}
              max={120}
              value={bg.size ?? 22}
              onChange={(v) => updateBoardBackground({ size: v })}
              suffix="px"
            />
          </Section>
        )}

        {(bg.kind === "gradient" || bg.kind === "iso") && (
          <Section title="Angle">
            <Slider
              min={0}
              max={360}
              value={bg.angle ?? 30}
              onChange={(v) => updateBoardBackground({ angle: v })}
              suffix="°"
            />
          </Section>
        )}

        {(bg.kind === "image" || bg.kind === "gradient") && (
          <Section title="Blur">
            <Slider
              min={0}
              max={40}
              value={bg.blur ?? 0}
              onChange={(v) => updateBoardBackground({ blur: v })}
              suffix="px"
            />
          </Section>
        )}

        {bg.kind === "image" && (
          <Section title="Image">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-[10px] hover:bg-white/5">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                }}
              />
              Choose image
            </label>
            {bg.imageUrl && (
              <button
                type="button"
                onClick={() => updateBoardBackground({ imageUrl: undefined })}
                className="ml-2 rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-400/10"
              >
                Remove
              </button>
            )}
          </Section>
        )}

        <Section title="Opacity">
          <Slider
            min={20}
            max={100}
            value={Math.round((bg.opacity ?? 1) * 100)}
            onChange={(v) => updateBoardBackground({ opacity: v / 100 })}
            suffix="%"
          />
        </Section>

        {error && (
          <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-3 border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-dim)]/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-dim)]">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0"
      />
    </label>
  );
}

function Slider({
  min,
  max,
  value,
  onChange,
  suffix,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-violet-400"
      />
      <span className="w-10 text-right text-[10px] tabular-nums text-[var(--color-ink-dim)]">
        {value}{suffix}
      </span>
    </div>
  );
}
