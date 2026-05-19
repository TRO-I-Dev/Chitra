import { useState } from "react";
import type { Project } from "@chitra/core";
import { useProjectStore } from "../state/projectStore.js";
import {
  BUILTIN_PALETTES,
  FONT_PRESETS,
  type FontPreset,
} from "../state/paletteEngine.js";

/**
 * Theme Studio — mix palette, font, and project-wide defaults. Renders
 * as a floating panel anchored to the top of the workspace, matching
 * the visual language of BackgroundPanel and EdgeStylePanel.
 *
 * The view is intentionally lightweight: each section binds directly
 * to `project.theme.*` via `updateProjectTheme`, so there's no local
 * draft state and changes apply live.
 */
export function ThemeStudio({ onClose }: { onClose: () => void }): JSX.Element | null {
  const project = useProjectStore((s) => s.project);
  const updateProjectTheme = useProjectStore((s) => s.updateProjectTheme);
  const upsertPalette = useProjectStore((s) => s.upsertPalette);
  const [tab, setTab] = useState<"palette" | "font" | "custom">("palette");

  if (!project) return null;
  const theme = project.theme ?? {};
  const currentPaletteId = theme.paletteId ?? "studio";

  return (
    <div className="pointer-events-none absolute inset-x-3 top-16 z-30 flex justify-center">
      <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d14]/95 text-sm shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
              Theme studio
            </span>
            <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5 text-[11px]">
              <TabBtn active={tab === "palette"} onClick={() => setTab("palette")}>
                Palette
              </TabBtn>
              <TabBtn active={tab === "font"} onClick={() => setTab("font")}>
                Font
              </TabBtn>
              <TabBtn active={tab === "custom"} onClick={() => setTab("custom")}>
                Custom
              </TabBtn>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateProjectTheme(null)}
              className="rounded-md px-2 py-1 text-[10px] text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
              title="Reset entire theme to defaults"
            >
              Reset all
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close theme studio"
              className="rounded-md px-2 py-1 text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {tab === "palette" && (
            <PaletteTab
              project={project}
              currentId={currentPaletteId}
              onPick={(id) => updateProjectTheme({ paletteId: id })}
            />
          )}
          {tab === "font" && (
            <FontTab
              currentFamily={theme.font?.family ?? null}
              onPick={(preset) =>
                updateProjectTheme({
                  font: {
                    family: preset.family,
                    source: preset.source,
                    ...(preset.weights ? { weights: preset.weights } : {}),
                  },
                })
              }
              onClear={() => updateProjectTheme({ font: undefined })}
            />
          )}
          {tab === "custom" && (
            <CustomTab
              onSave={(palette) => {
                upsertPalette(palette);
                updateProjectTheme({ paletteId: palette.id });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Palette tab                                                         *
 * ------------------------------------------------------------------ */

function PaletteTab({
  project,
  currentId,
  onPick,
}: {
  project: Project;
  currentId: string;
  onPick: (id: string) => void;
}): JSX.Element {
  const customs = project.palettes ?? [];
  return (
    <div className="space-y-4">
      <Section title="Built-in palettes">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BUILTIN_PALETTES.map((p) => (
            <PaletteSwatch
              key={p.id}
              label={p.label}
              tokens={p.tokens}
              active={currentId === p.id}
              onClick={() => onPick(p.id)}
            />
          ))}
        </div>
      </Section>

      {customs.length > 0 && (
        <Section title="Custom palettes">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {customs.map((p) => (
              <PaletteSwatch
                key={p.id}
                label={p.label}
                tokens={p.tokens}
                active={currentId === p.id}
                onClick={() => onPick(p.id)}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function PaletteSwatch({
  label,
  tokens,
  active,
  onClick,
}: {
  label: string;
  tokens: { canvasBg?: string; accent?: string; accent2?: string; canvasInk?: string };
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition",
        active
          ? "border-white/40 bg-white/5 ring-1 ring-white/30"
          : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/5",
      ].join(" ")}
      aria-pressed={active}
    >
      <div
        className="h-14 overflow-hidden rounded-md"
        style={{ background: tokens.canvasBg ?? "#0b0b10" }}
      >
        <div className="flex h-full items-end gap-1 p-1.5">
          <span
            className="h-3 flex-1 rounded-sm"
            style={{ background: tokens.accent ?? "#7c5cff" }}
          />
          <span
            className="h-3 flex-1 rounded-sm"
            style={{ background: tokens.accent2 ?? "#21d4fd" }}
          />
        </div>
      </div>
      <div
        className="truncate px-1 text-[11px] font-medium"
        style={{ color: tokens.canvasInk ?? "var(--color-ink)" }}
      >
        {label}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 *  Font tab                                                            *
 * ------------------------------------------------------------------ */

function FontTab({
  currentFamily,
  onPick,
  onClear,
}: {
  currentFamily: string | null;
  onPick: (preset: FontPreset) => void;
  onClear: () => void;
}): JSX.Element {
  return (
    <Section
      title="Project font"
      action={
        currentFamily ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
          >
            Use system default
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FONT_PRESETS.map((f) => {
          const active = currentFamily === f.family;
          // Quote multi-word families so the preview renders even before
          // the Google Font finishes loading.
          const previewFamily = /\s/.test(f.family) ? `"${f.family}"` : f.family;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f)}
              className={[
                "flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition",
                active
                  ? "border-white/40 bg-white/5 ring-1 ring-white/30"
                  : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/5",
              ].join(" ")}
              aria-pressed={active}
            >
              <span
                className="text-base leading-tight text-[var(--color-ink)]"
                style={{ fontFamily: `${previewFamily}, ui-sans-serif, sans-serif` }}
              >
                Aa Bb 123
              </span>
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)]">
                <span>{f.label}</span>
                {f.source === "google" && (
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] normal-case tracking-normal">
                    google
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 *  Custom palette tab                                                  *
 * ------------------------------------------------------------------ */

function CustomTab({
  onSave,
}: {
  onSave: (palette: { id: string; label: string; tokens: Record<string, string> }) => void;
}): JSX.Element {
  const [label, setLabel] = useState("My palette");
  const [canvasBg, setCanvasBg] = useState("#0b0b10");
  const [canvasInk, setCanvasInk] = useState("#e7e7ee");
  const [accent, setAccent] = useState("#7c5cff");
  const [accent2, setAccent2] = useState("#21d4fd");

  const save = (): void => {
    const id = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `palette-${Date.now()}`;
    onSave({
      id,
      label: label.trim() || "Untitled",
      tokens: { canvasBg, canvasInk, accent, accent2 },
    });
  };

  return (
    <Section
      title="Create a palette"
      action={
        <button
          type="button"
          onClick={save}
          className="rounded-md border border-[var(--color-accent-2)]/40 bg-[var(--color-accent-2)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-2)] transition hover:bg-[var(--color-accent-2)]/20"
        >
          Save & apply
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-[var(--color-ink)] outline-none focus:border-white/30"
          />
        </Field>
        <ColorField label="Canvas" value={canvasBg} onChange={setCanvasBg} />
        <ColorField label="Ink" value={canvasInk} onChange={setCanvasInk} />
        <ColorField label="Accent" value={accent} onChange={setAccent} />
        <ColorField label="Accent 2" value={accent2} onChange={setAccent2} />
      </div>

      {/* Live preview chip */}
      <div className="mt-3 rounded-xl border border-white/10 p-2" style={{ background: canvasBg }}>
        <div className="flex items-center gap-2" style={{ color: canvasInk }}>
          <span className="text-xs font-semibold">Preview</span>
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: accent }} />
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: accent2 }} />
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 *  Tiny shared bits                                                    *
 * ------------------------------------------------------------------ */

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-2.5 py-0.5 transition",
        active
          ? "bg-white/10 text-[var(--color-ink)]"
          : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
        {label}
      </span>
      {children}
    </label>
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
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#202028";
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-1.5 py-1">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={`${label} colour`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[11px] text-[var(--color-ink)] outline-none"
        />
      </div>
    </Field>
  );
}
