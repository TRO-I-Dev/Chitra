/**
 * Calibration quality checks.
 *
 * A calibration can complete successfully and still be useless. The common
 * failure is *collision*: the user records two poses that are nearly identical
 * as far as the classifier can tell — "point" and "L shape" differ only in the
 * thumb, and if their thumb barely moves between them, the two centroids land
 * on top of each other. At runtime the ambiguity guard then refuses both, so
 * the symptom is "the gesture doesn't work" with no clue why.
 *
 * Catching that inside the wizard, while the user is still there and can redo
 * the offending pose, is worth far more than discovering it later on the board.
 */

import { GESTURES, type GestureCalibration, type GestureId } from "./gestureProfile.js";

export interface QualityIssue {
  kind: "collision" | "unsteady";
  gestures: GestureId[];
  /** Human-readable, actionable. */
  message: string;
  severity: "warn" | "error";
}

/** Same clamping the classifier applies, kept in step deliberately. */
function sigma(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0.2;
  return Math.min(Math.max(v, 0.05), 0.3);
}

/**
 * Distance between two calibrated poses, in pooled standard deviations.
 *
 * Below ~2σ the classifier's ambiguity guard will start refusing both poses,
 * because neither can beat the other by the required margin.
 */
export function poseSeparation(a: GestureCalibration, b: GestureCalibration): number {
  if (!a.centroid || !b.centroid) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const sa = sigma(a.deviation?.[i]);
    const sb = sigma(b.deviation?.[i]);
    // Pooled deviation, so a pair where either pose is loose on an axis counts
    // that axis as weak evidence.
    const pooled = Math.sqrt((sa * sa + sb * sb) / 2);
    const d = (a.centroid[i]! - b.centroid[i]!) / pooled;
    sum += d * d;
  }
  return Math.sqrt(sum / 5);
}

const COLLISION_SIGMAS = 1.6;
const UNSTEADY_SPREAD = 0.2;

/** Inspect a finished calibration and report anything worth telling the user. */
export function checkCalibration(
  calibration: Partial<Record<GestureId, GestureCalibration>>,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const label = (id: GestureId): string => GESTURES.find((g) => g.id === id)?.label ?? id;

  const posed = (Object.keys(calibration) as GestureId[]).filter(
    (id) => calibration[id]?.centroid && calibration[id]?.calibratedAt,
  );

  /* ---- collisions ---- */
  for (let i = 0; i < posed.length; i++) {
    for (let j = i + 1; j < posed.length; j++) {
      const a = posed[i]!;
      const b = posed[j]!;
      const sep = poseSeparation(calibration[a]!, calibration[b]!);
      if (sep < COLLISION_SIGMAS) {
        issues.push({
          kind: "collision",
          gestures: [a, b],
          severity: sep < 1 ? "error" : "warn",
          message: `“${label(a)}” and “${label(b)}” look too alike to tell apart (${sep.toFixed(1)}σ). Re-record one of them, making the difference more exaggerated.`,
        });
      }
    }
  }

  /* ---- unsteady holds ---- */
  for (const id of posed) {
    const spread = calibration[id]?.spread ?? 0;
    if (spread > UNSTEADY_SPREAD) {
      issues.push({
        kind: "unsteady",
        gestures: [id],
        severity: "warn",
        message: `“${label(id)}” was held quite loosely, so recognition will be forgiving but less precise. Re-record it holding steadier if it misfires.`,
      });
    }
  }

  // Worst first: an error is actionable, a warning is advisory.
  return issues.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "error" ? -1 : 1));
}
