/**
 * Air Board session state.
 *
 * Split from the project store on purpose: none of this belongs in the saved
 * `.chitra` file. Only the *result* of an Air Board session — the elements it
 * commits into the sketch layer — is persisted.
 */

import { create } from "zustand";
import {
  DEFAULT_PROFILE,
  type GestureProfile,
  loadProfile,
  saveProfile,
} from "./gestureProfile.js";
import type { TrackerPhase } from "./handTracker.js";
import type { ShapeKind } from "./strokeShaper.js";

export type AirTool =
  | "pen"
  | "marker"
  | "eraser"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "card"
  | "laser";

export interface AirToolMeta {
  id: AirTool;
  label: string;
  glyph: string;
  hint: string;
}

export const AIR_TOOLS: readonly AirToolMeta[] = [
  { id: "pen", label: "Pen", glyph: "✎", hint: "Freehand ink; straightens into shapes" },
  { id: "marker", label: "Marker", glyph: "▬", hint: "Thick translucent highlighter" },
  { id: "rectangle", label: "Box", glyph: "▭", hint: "Drag a rectangle" },
  { id: "ellipse", label: "Circle", glyph: "◯", hint: "Drag an ellipse" },
  { id: "diamond", label: "Diamond", glyph: "◇", hint: "Drag a decision diamond" },
  { id: "arrow", label: "Arrow", glyph: "→", hint: "Drag a connector arrow" },
  { id: "line", label: "Line", glyph: "／", hint: "Drag a straight line" },
  { id: "card", label: "Card", glyph: "▤", hint: "Drag a box to spawn a Chitra card" },
  { id: "eraser", label: "Eraser", glyph: "⌫", hint: "Sweep to remove ink" },
  { id: "laser", label: "Laser", glyph: "✷", hint: "Point without drawing" },
] as const;

/** Ink palette — matches the studio accents so air ink looks native. */
export const AIR_COLORS: readonly { name: string; value: string }[] = [
  { name: "Chalk", value: "#e7e7ee" },
  { name: "Accent", value: "#7c8cff" },
  { name: "Cyan", value: "#37d3d0" },
  { name: "Amber", value: "#ffb44d" },
  { name: "Rose", value: "#ff6b8a" },
  { name: "Lime", value: "#7ee787" },
] as const;

export interface ShapeFeedback {
  kind: ShapeKind;
  why: string;
  confidence: number;
  at: number;
}

interface AirBoardState {
  /** Is the Air Board overlay mounted and the camera live? */
  active: boolean;
  /** Tracker lifecycle, mirrored for the HUD. */
  phase: TrackerPhase;
  statusMessage: string | null;
  fps: number;
  inferenceMs: number;
  /** Resolution the camera actually granted, for the HUD. */
  resolution: { w: number; h: number } | null;

  tool: AirTool;
  color: string;
  strokeWidth: number;
  /** Persisted, user-tunable gesture configuration. */
  profile: GestureProfile;

  /** Radial tool ring visible (opened by the "menu" gesture). */
  ringOpen: boolean;
  calibrationOpen: boolean;
  settingsOpen: boolean;
  /** The illustrated field guide. */
  tutorialOpen: boolean;
  /**
   * Hide the cards, edges and side panels while drawing, leaving a clean
   * surface. On by default: air ink is low-contrast and hard to place over a
   * busy board, and the whole point of the mode is a blank wall to draw on.
   */
  cleanBoard: boolean;
  /** Camera picture-in-picture visible. */
  previewOn: boolean;
  /** Chosen camera deviceId, or null for the system default. */
  cameraId: string | null;

  /** Last recognition result, shown briefly as a toast-in-HUD. */
  lastShape: ShapeFeedback | null;
  strokeCount: number;
  shapeCount: number;

  setActive: (v: boolean) => void;
  setPhase: (phase: TrackerPhase, message?: string | null) => void;
  setPerf: (fps: number, inferenceMs: number, resolution?: { w: number; h: number } | null) => void;
  setTool: (t: AirTool) => void;
  setColor: (c: string) => void;
  setStrokeWidth: (w: number) => void;
  setProfile: (p: GestureProfile) => void;
  patchProfile: (patch: Partial<GestureProfile>) => void;
  resetProfile: () => void;
  setRingOpen: (v: boolean) => void;
  setCalibrationOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setTutorialOpen: (v: boolean) => void;
  setCleanBoard: (v: boolean) => void;
  setPreviewOn: (v: boolean) => void;
  setCameraId: (id: string | null) => void;
  noteShape: (f: ShapeFeedback) => void;
  clearShape: () => void;
}

export const useAirBoard = create<AirBoardState>((set, get) => ({
  active: false,
  phase: "idle",
  statusMessage: null,
  fps: 0,
  inferenceMs: 0,
  resolution: null,

  tool: "pen",
  color: AIR_COLORS[0]!.value,
  strokeWidth: 2,
  profile: loadProfile(),

  ringOpen: false,
  calibrationOpen: false,
  settingsOpen: false,
  tutorialOpen: false,
  cleanBoard: true,
  previewOn: true,
  cameraId: null,

  lastShape: null,
  strokeCount: 0,
  shapeCount: 0,

  setActive: (active) =>
    set(
      active
        ? { active }
        : // Leaving Air Board must not strand a modal or the tool ring open.
          { active, ringOpen: false, phase: "idle", statusMessage: null, fps: 0 },
    ),
  setPhase: (phase, message) => set({ phase, statusMessage: message ?? null }),
  setPerf: (fps, inferenceMs, resolution) =>
    set(resolution === undefined ? { fps, inferenceMs } : { fps, inferenceMs, resolution }),
  setTool: (tool) => set({ tool, ringOpen: false }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setProfile: (profile) => {
    saveProfile(profile);
    set({ profile });
  },
  patchProfile: (patch) => {
    const next = { ...get().profile, ...patch };
    saveProfile(next);
    set({ profile: next });
  },
  resetProfile: () => {
    saveProfile(DEFAULT_PROFILE);
    set({ profile: DEFAULT_PROFILE });
  },
  setRingOpen: (ringOpen) => set({ ringOpen }),
  setCalibrationOpen: (calibrationOpen) => set({ calibrationOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setTutorialOpen: (tutorialOpen) => set({ tutorialOpen }),
  setCleanBoard: (cleanBoard) => set({ cleanBoard }),
  setPreviewOn: (previewOn) => set({ previewOn }),
  setCameraId: (cameraId) => set({ cameraId }),
  noteShape: (lastShape) =>
    set((s) => ({
      lastShape,
      strokeCount: s.strokeCount + 1,
      shapeCount: lastShape.kind === "freedraw" ? s.shapeCount : s.shapeCount + 1,
    })),
  clearShape: () => set({ lastShape: null }),
}));

/** Style bundle for the active tool, resolved from the store. */
export function inkStyleFor(
  tool: AirTool,
  color: string,
  strokeWidth: number,
): {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: number;
  opacity: number;
  rounded: boolean;
} {
  const marker = tool === "marker";
  return {
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: marker ? Math.max(strokeWidth * 4, 8) : strokeWidth,
    strokeStyle: "solid",
    // Air strokes are already irregular; adding rough.js jitter on top reads
    // as sloppy, so shapes commit crisp and only the pen keeps a little.
    roughness: tool === "pen" || marker ? 1 : 0,
    opacity: marker ? 45 : 100,
    rounded: true,
  };
}
