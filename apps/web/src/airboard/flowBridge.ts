/**
 * Bridge to the React Flow instance that owns the structure canvas.
 *
 * Air Board needs it for exactly one thing: turning a page-space point under
 * the air cursor into a board position, so a card spawned mid-air lands where
 * the user drew it rather than at the origin.
 */

import type { ReactFlowInstance } from "@xyflow/react";

let instance: ReactFlowInstance | null = null;

export function registerFlowApi(next: ReactFlowInstance | null): void {
  instance = next;
}

export function getFlowApi(): ReactFlowInstance | null {
  return instance;
}

/** Page coordinates → board (flow) coordinates. Falls back to identity. */
export function pageToFlow(p: { x: number; y: number }): { x: number; y: number } {
  if (!instance) return p;
  try {
    return instance.screenToFlowPosition({ x: p.x, y: p.y });
  } catch {
    return p;
  }
}
