/**
 * Bridge between Air Board and the board's Excalidraw sketch layer.
 *
 * `SketchOverlay` registers its imperative API here on mount; Air Board reads
 * the live scroll/zoom from it to place strokes exactly under the air cursor,
 * and writes finished elements back through `updateScene`. Excalidraw's own
 * `onChange` then persists them onto the board — so Air Board never touches
 * the project store directly and stays in step with mouse-drawn ink.
 */

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { Pt } from "./strokeShaper.js";

type Listener = (api: ExcalidrawImperativeAPI | null) => void;

let api: ExcalidrawImperativeAPI | null = null;
const listeners = new Set<Listener>();

export function registerSketchApi(next: ExcalidrawImperativeAPI | null): void {
  api = next;
  for (const fn of listeners) fn(next);
}

export function getSketchApi(): ExcalidrawImperativeAPI | null {
  return api;
}

export function onSketchApi(fn: Listener): () => void {
  listeners.add(fn);
  fn(api);
  return () => listeners.delete(fn);
}

interface SceneTransform {
  scrollX: number;
  scrollY: number;
  zoom: number;
  offsetLeft: number;
  offsetTop: number;
}

function transform(): SceneTransform {
  const st = api?.getAppState() as
    | {
        scrollX?: number;
        scrollY?: number;
        zoom?: { value?: number };
        offsetLeft?: number;
        offsetTop?: number;
      }
    | undefined;
  return {
    scrollX: st?.scrollX ?? 0,
    scrollY: st?.scrollY ?? 0,
    zoom: st?.zoom?.value ?? 1,
    offsetLeft: st?.offsetLeft ?? 0,
    offsetTop: st?.offsetTop ?? 0,
  };
}

/** Viewport (CSS px, page coords) → Excalidraw scene coords. */
export function viewportToScene(p: Pt): Pt {
  const t = transform();
  return {
    x: (p.x - t.offsetLeft) / t.zoom - t.scrollX,
    y: (p.y - t.offsetTop) / t.zoom - t.scrollY,
  };
}

/** Excalidraw scene coords → viewport (CSS px, page coords). */
export function sceneToViewport(p: Pt): Pt {
  const t = transform();
  return {
    x: (p.x + t.scrollX) * t.zoom + t.offsetLeft,
    y: (p.y + t.scrollY) * t.zoom + t.offsetTop,
  };
}

/** Current scene zoom — used to keep stroke width visually constant. */
export function sceneZoom(): number {
  return transform().zoom;
}

/** Append elements to the scene. Returns the ids that were added. */
export function appendElements(elements: readonly Record<string, unknown>[]): string[] {
  if (!api || elements.length === 0) return [];
  const current = api.getSceneElements();
  api.updateScene({ elements: [...current, ...elements] as never });
  return elements.map((e) => String(e.id));
}

/** Soft-delete elements by id (Excalidraw's own delete semantics). */
export function deleteElements(ids: readonly string[]): number {
  if (!api || ids.length === 0) return 0;
  const set = new Set(ids);
  const current = api.getSceneElements();
  let hit = 0;
  const next = current.map((el) => {
    if (!set.has(el.id) || el.isDeleted) return el;
    hit++;
    return { ...el, isDeleted: true, version: (el.version ?? 1) + 1, updated: Date.now() };
  });
  if (hit > 0) api.updateScene({ elements: next as never });
  return hit;
}

/**
 * Ids of every non-deleted element whose bounding box comes within `radius`
 * scene units of `at`. Deliberately bounds-based rather than exact-hit: an air
 * eraser is a blunt instrument and users expect it to be forgiving.
 */
export function elementsNear(at: Pt, radius: number): string[] {
  if (!api) return [];
  const hits: string[] = [];
  for (const el of api.getSceneElements()) {
    if (el.isDeleted) continue;
    const x0 = el.x - radius;
    const y0 = el.y - radius;
    const x1 = el.x + (el.width ?? 0) + radius;
    const y1 = el.y + (el.height ?? 0) + radius;
    if (at.x >= x0 && at.x <= x1 && at.y >= y0 && at.y <= y1) hits.push(el.id);
  }
  return hits;
}

/** Scroll the scene by a delta in viewport pixels (air-pan gesture). */
export function panScene(dxPx: number, dyPx: number): void {
  if (!api) return;
  const t = transform();
  api.updateScene({
    appState: {
      scrollX: t.scrollX + dxPx / t.zoom,
      scrollY: t.scrollY + dyPx / t.zoom,
    } as never,
  });
}

/** Total non-deleted element count — shown in the HUD. */
export function sceneElementCount(): number {
  if (!api) return 0;
  return api.getSceneElements().filter((e) => !e.isDeleted).length;
}
