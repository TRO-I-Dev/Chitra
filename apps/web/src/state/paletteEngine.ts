import type { Palette, PaletteTokens, Project, ProjectTheme } from "@chitra/core";

/* ------------------------------------------------------------------ *
 *  Built-in palettes                                                   *
 *                                                                      *
 *  Mirrors the 12 background palettes in `canvas/backgroundPalettes`   *
 *  but exposes the *full* token surface (text, edges, selection,       *
 *  status colours). When a palette is active these tokens are pushed   *
 *  to CSS custom properties on `<html>` so the whole app re-skins.     *
 * ------------------------------------------------------------------ */

export const BUILTIN_PALETTES: Palette[] = [
  {
    id: "studio",
    label: "Studio",
    tokens: {
      canvasBg: "#0b0b10",
      canvasInk: "#e7e7ee",
      canvasInkDim: "#9a9aaa",
      accent: "#7c5cff",
      accent2: "#21d4fd",
    },
  },
  {
    id: "paper",
    label: "Paper",
    tokens: {
      canvasBg: "#f7f4ec",
      canvasInk: "#2a2826",
      canvasInkDim: "#7a766f",
      accent: "#a77b3c",
      accent2: "#6b8e23",
      cardBg: "#fffdf7",
      cardStroke: "#d9d3c4",
      cardText: "#23211f",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    tokens: {
      canvasBg: "#1c1c20",
      canvasInk: "#e8e8ee",
      canvasInkDim: "#9c9ca6",
      accent: "#94a3b8",
      accent2: "#cbd5e1",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    tokens: {
      canvasBg: "#0a0b1f",
      canvasInk: "#e2e8ff",
      canvasInkDim: "#8c93b8",
      accent: "#6366f1",
      accent2: "#a5b4fc",
    },
  },
  {
    id: "sepia",
    label: "Sepia",
    tokens: {
      canvasBg: "#f3e7d3",
      canvasInk: "#3b2d1f",
      canvasInkDim: "#8a7458",
      accent: "#b45309",
      accent2: "#92400e",
      cardBg: "#fff7e8",
      cardStroke: "#d4bc91",
      cardText: "#3b2d1f",
    },
  },
  {
    id: "mint",
    label: "Mint",
    tokens: {
      canvasBg: "#0f1d18",
      canvasInk: "#e0fff0",
      canvasInkDim: "#86b1a0",
      accent: "#34d399",
      accent2: "#a7f3d0",
    },
  },
  {
    id: "lavender",
    label: "Lavender",
    tokens: {
      canvasBg: "#1c1424",
      canvasInk: "#f5e6ff",
      canvasInkDim: "#b39cc4",
      accent: "#c084fc",
      accent2: "#f0abfc",
    },
  },
  {
    id: "sunrise",
    label: "Sunrise",
    tokens: {
      canvasBg: "#1f1418",
      canvasInk: "#ffe9d9",
      canvasInkDim: "#bf9c8d",
      accent: "#fb923c",
      accent2: "#fbbf24",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    tokens: {
      canvasBg: "#1a0f1c",
      canvasInk: "#ffd9e7",
      canvasInkDim: "#b58aa0",
      accent: "#f472b6",
      accent2: "#fb7185",
    },
  },
  {
    id: "carbon",
    label: "Carbon",
    tokens: {
      canvasBg: "#0a0a0a",
      canvasInk: "#fafafa",
      canvasInkDim: "#7a7a7a",
      accent: "#fb923c",
      accent2: "#facc15",
    },
  },
  {
    id: "blueprint",
    label: "Blueprint",
    tokens: {
      canvasBg: "#0d2247",
      canvasInk: "#dbe8ff",
      canvasInkDim: "#8ba0c4",
      accent: "#60a5fa",
      accent2: "#93c5fd",
    },
  },
  {
    id: "iso",
    label: "Iso",
    tokens: {
      canvasBg: "#0f1014",
      canvasInk: "#e6e8ee",
      canvasInkDim: "#8e909a",
      accent: "#22d3ee",
      accent2: "#a78bfa",
    },
  },
];

export const PALETTE_BY_ID = new Map(BUILTIN_PALETTES.map((p) => [p.id, p] as const));

/** Resolve a palette id to its tokens, searching built-ins first then
 *  the project's user-defined palettes. Returns null if unknown. */
export function findPaletteTokens(
  id: string | undefined,
  project: Project | null,
): PaletteTokens | null {
  if (!id) return null;
  const builtin = PALETTE_BY_ID.get(id);
  if (builtin) return builtin.tokens;
  const custom = project?.palettes?.find((p) => p.id === id);
  return custom?.tokens ?? null;
}

/* ------------------------------------------------------------------ *
 *  CSS variable application                                            *
 *                                                                      *
 *  Maps PaletteTokens → existing CSS variables in index.css            *
 *  (`--color-canvas`, `--color-ink`, `--color-accent`, etc.).          *
 *  Unset tokens fall through to the values defined in index.css.       *
 * ------------------------------------------------------------------ */

const TOKEN_TO_CSS: Record<keyof PaletteTokens, string> = {
  canvasBg: "--color-canvas",
  canvasInk: "--color-ink",
  canvasInkDim: "--color-ink-dim",
  accent: "--color-accent",
  accent2: "--color-accent-2",
  // Card / edge / status tokens currently have no top-level CSS var
  // (they're used inline in components). We still write them so future
  // CSS can `var(--chitra-card-bg)` etc.
  cardBg: "--chitra-card-bg",
  cardStroke: "--chitra-card-stroke",
  cardText: "--chitra-card-text",
  edgeDefault: "--chitra-edge-default",
  edgeEmphasis: "--chitra-edge-emphasis",
  selection: "--chitra-selection",
  success: "--chitra-success",
  warn: "--chitra-warn",
  danger: "--chitra-danger",
};

/** Track which CSS variables we've set so we can clean them up when
 *  switching projects or themes. */
let activeVars: string[] = [];

export function applyPaletteTokens(tokens: PaletteTokens | null): void {
  const root = document.documentElement;
  // Clear previously applied tokens so palette switches don't leak.
  for (const cssVar of activeVars) root.style.removeProperty(cssVar);
  activeVars = [];

  if (!tokens) return;
  for (const [key, val] of Object.entries(tokens) as Array<
    [keyof PaletteTokens, string | undefined]
  >) {
    if (!val) continue;
    const cssVar = TOKEN_TO_CSS[key];
    if (!cssVar) continue;
    root.style.setProperty(cssVar, val);
    activeVars.push(cssVar);
  }
}

/* ------------------------------------------------------------------ *
 *  Font application                                                    *
 *                                                                      *
 *  `source: "google"` lazily injects a single <link rel="stylesheet">  *
 *  per requested family. Other sources just update --font-sans.        *
 * ------------------------------------------------------------------ */

const LOADED_GOOGLE_FAMILIES = new Set<string>();
const GOOGLE_LINK_ID_PREFIX = "chitra-font-";

export function applyProjectFont(font: ProjectTheme["font"] | undefined): void {
  const root = document.documentElement;
  if (!font?.family) {
    root.style.removeProperty("--font-sans");
    return;
  }
  if (font.source === "google") {
    loadGoogleFont(font.family, font.weights);
  }
  // Wrap multi-word families in quotes per CSS spec.
  const css = /\s/.test(font.family) && !font.family.startsWith("\"")
    ? `"${font.family}"`
    : font.family;
  root.style.setProperty(
    "--font-sans",
    `${css}, ui-sans-serif, system-ui, sans-serif`,
  );
}

function loadGoogleFont(family: string, weights?: number[]): void {
  if (LOADED_GOOGLE_FAMILIES.has(family)) return;
  LOADED_GOOGLE_FAMILIES.add(family);
  const id = `${GOOGLE_LINK_ID_PREFIX}${family.replace(/\W+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const wghts = (weights && weights.length > 0 ? weights : [400, 600])
    .slice()
    .sort((a, b) => a - b)
    .join(";");
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  ).replace(/%20/g, "+")}:wght@${wghts}&display=swap`;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/* ------------------------------------------------------------------ *
 *  Whole-theme application                                             *
 * ------------------------------------------------------------------ */

export function applyProjectTheme(project: Project | null): void {
  const theme = project?.theme;
  const tokens = findPaletteTokens(theme?.paletteId, project);
  applyPaletteTokens(tokens);
  applyProjectFont(theme?.font);
}

/* ------------------------------------------------------------------ *
 *  Curated font catalogue offered in the picker                        *
 * ------------------------------------------------------------------ */

export interface FontPreset {
  id: string;
  label: string;
  family: string;
  source: "system" | "bundled" | "google";
  weights?: number[];
}

export const FONT_PRESETS: FontPreset[] = [
  { id: "system", label: "System", family: "ui-sans-serif", source: "system" },
  { id: "inter", label: "Inter", family: "Inter", source: "bundled", weights: [400, 600] },
  { id: "fraunces", label: "Fraunces", family: "Fraunces", source: "bundled", weights: [400, 600] },
  { id: "jetbrains", label: "JetBrains Mono", family: "JetBrains Mono", source: "bundled", weights: [400, 600] },
  { id: "ibm-plex", label: "IBM Plex Sans", family: "IBM Plex Sans", source: "google", weights: [400, 600] },
  { id: "manrope", label: "Manrope", family: "Manrope", source: "google", weights: [400, 600] },
  { id: "lora", label: "Lora", family: "Lora", source: "google", weights: [400, 600] },
  { id: "space-grotesk", label: "Space Grotesk", family: "Space Grotesk", source: "google", weights: [400, 600] },
  { id: "merriweather", label: "Merriweather", family: "Merriweather", source: "google", weights: [400, 700] },
  { id: "source-serif", label: "Source Serif 4", family: "Source Serif 4", source: "google", weights: [400, 600] },
];
