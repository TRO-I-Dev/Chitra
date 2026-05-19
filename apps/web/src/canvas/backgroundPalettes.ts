import type { BackgroundKind, BoardBackground } from "@chitra/core";

export interface BackgroundPalette {
  id: string;
  label: string;
  /** Default kind to apply when this palette is picked. */
  kind: BackgroundKind;
  color: string;
  accent: string;
  /** Optional secondary swatch shown in the picker (e.g. gradient stop 2). */
  swatch?: string;
  /** Whether this palette assumes a dark or light text/canvas baseline.
   *  Used by the renderer to flip default node text colours later. */
  baseline: "dark" | "light";
}

/** 12 curated palettes shipped with Chitra. Users can still override
 *  individual colours after picking a palette. */
export const BACKGROUND_PALETTES: BackgroundPalette[] = [
  { id: "studio",   label: "Studio",    kind: "studio",   color: "#0b0b10", accent: "#7c5cff", baseline: "dark"  },
  { id: "paper",    label: "Paper",     kind: "dots",     color: "#f7f5ee", accent: "#c9c4b4", baseline: "light" },
  { id: "graphite", label: "Graphite",  kind: "grid",     color: "#15171c", accent: "#2a2d36", baseline: "dark"  },
  { id: "midnight", label: "Midnight",  kind: "dots",     color: "#070713", accent: "#312e81", baseline: "dark"  },
  { id: "sepia",    label: "Sepia",     kind: "lines",    color: "#f4ecd8", accent: "#a78f5f", baseline: "light" },
  { id: "mint",     label: "Mint",      kind: "dots",     color: "#0d1f1a", accent: "#34d399", baseline: "dark"  },
  { id: "lavender", label: "Lavender",  kind: "dots",     color: "#f5f0fb", accent: "#c4b5fd", baseline: "light" },
  { id: "sunrise",  label: "Sunrise",   kind: "gradient", color: "#1f0f1f", accent: "#ff7e5f", swatch: "#feb47b", baseline: "dark"  },
  { id: "sunset",   label: "Sunset",    kind: "gradient", color: "#0f0b1a", accent: "#7c3aed", swatch: "#ec4899", baseline: "dark"  },
  { id: "carbon",   label: "Carbon",    kind: "grid",     color: "#0a0a0a", accent: "#3f3f46", baseline: "dark"  },
  { id: "blueprint",label: "Blueprint", kind: "grid",     color: "#0b2447", accent: "#3b82f6", baseline: "dark"  },
  { id: "iso",      label: "Iso",       kind: "iso",      color: "#0d121d", accent: "#475569", baseline: "dark"  },
];

export const PALETTE_BY_ID = new Map(BACKGROUND_PALETTES.map((p) => [p.id, p]));

export const DEFAULT_BACKGROUND: BoardBackground = {
  kind: "studio",
  palette: "studio",
  color: "#0b0b10",
  accent: "#7c5cff",
  opacity: 1,
};

export const BACKGROUND_KINDS: { value: BackgroundKind; label: string }[] = [
  { value: "studio",   label: "Studio"   },
  { value: "solid",    label: "Solid"    },
  { value: "dots",     label: "Dots"     },
  { value: "grid",     label: "Grid"     },
  { value: "lines",    label: "Lines"    },
  { value: "iso",      label: "Iso"      },
  { value: "gradient", label: "Gradient" },
  { value: "image",    label: "Image"    },
];

/** Merge a palette's defaults into an existing background, preserving any
 *  user-set overrides that diverge from the palette baseline. */
export function applyPalette(
  current: BoardBackground | undefined,
  paletteId: string,
): BoardBackground {
  const p = PALETTE_BY_ID.get(paletteId);
  if (!p) return current ?? DEFAULT_BACKGROUND;
  return {
    ...(current ?? {}),
    kind: p.kind,
    palette: p.id,
    color: p.color,
    accent: p.accent,
  };
}

/** Resolve the actual background to render. Falls back to the app default
 *  when neither board nor project specify one. */
export function resolveBackground(
  boardBg: BoardBackground | undefined,
): BoardBackground {
  if (!boardBg) return DEFAULT_BACKGROUND;
  const palette = boardBg.palette ? PALETTE_BY_ID.get(boardBg.palette) : null;
  return {
    kind: boardBg.kind ?? palette?.kind ?? "studio",
    color: boardBg.color ?? palette?.color ?? DEFAULT_BACKGROUND.color,
    accent: boardBg.accent ?? palette?.accent ?? DEFAULT_BACKGROUND.accent,
    ...(boardBg.size !== undefined ? { size: boardBg.size } : {}),
    ...(boardBg.angle !== undefined ? { angle: boardBg.angle } : {}),
    ...(boardBg.palette !== undefined ? { palette: boardBg.palette } : {}),
    ...(boardBg.imageUrl !== undefined ? { imageUrl: boardBg.imageUrl } : {}),
    ...(boardBg.opacity !== undefined ? { opacity: boardBg.opacity } : {}),
    ...(boardBg.blur !== undefined ? { blur: boardBg.blur } : {}),
  };
}
