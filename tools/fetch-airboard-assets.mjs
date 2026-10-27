#!/usr/bin/env node
/**
 * Materialises Air Board's vision assets into `apps/web/public/mediapipe/`.
 *
 * These are ~30 MB of third-party binaries — four times the size of the whole
 * git history — so they are generated rather than committed:
 *
 *   - The WASM runtime is **copied from `node_modules`**, where it already
 *     lives as a real dependency (`@mediapipe/tasks-vision`). No network, and
 *     the version is pinned by the lockfile like everything else.
 *   - The hand-landmark model is downloaded once from Google's model store
 *     and then cached on disk. Subsequent runs are a no-op.
 *
 * Runs automatically before `dev` and `build` for both the web and desktop
 * targets. Safe to run any time; it only writes what's missing.
 *
 * If you would rather have fully offline builds, delete the `mediapipe/` entry
 * from `.gitignore` and commit the folder — nothing else needs to change.
 */

import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const publicDir = join(repoRoot, "apps", "web", "public", "mediapipe");
const wasmOut = join(publicDir, "wasm");
const modelOut = join(publicDir, "models");

/** Both SIMD and non-SIMD builds; FilesetResolver picks at runtime. */
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const MODEL = {
  name: "hand_landmarker.task",
  url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  // Sanity floor, not a checksum — enough to catch a truncated or
  // error-page download without pinning us to a byte-exact revision.
  minBytes: 5_000_000,
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveWasmDir() {
  // pnpm links the package into the consuming workspace, so this is the
  // direct hit in practice.
  const linked = join(
    repoRoot,
    "apps", "web", "node_modules", "@mediapipe", "tasks-vision", "wasm",
  );
  if (await exists(linked)) return linked;

  // Fallback for hoisted / npm / yarn layouts. Resolve the package *entry*
  // rather than its package.json — the `exports` map doesn't expose the
  // latter, so resolving it throws.
  const require = createRequire(import.meta.url);
  for (const from of [join(repoRoot, "apps", "web"), repoRoot]) {
    try {
      const entry = require.resolve("@mediapipe/tasks-vision", { paths: [from] });
      // .../tasks-vision/vision_bundle.mjs → .../tasks-vision/wasm
      const candidate = join(dirname(entry), "wasm");
      if (await exists(candidate)) return candidate;
    } catch {
      /* try the next root */
    }
  }
  return null;
}

async function copyWasm() {
  const src = await resolveWasmDir();
  if (!src) {
    throw new Error(
      "@mediapipe/tasks-vision is not installed. Run `pnpm install` first.",
    );
  }
  await mkdir(wasmOut, { recursive: true });
  let copied = 0;
  for (const file of WASM_FILES) {
    const from = join(src, file);
    const to = join(wasmOut, file);
    if (!(await exists(from))) {
      throw new Error(`Missing ${file} in ${src} — is the package intact?`);
    }
    // Skip when the destination already matches in size; these files never
    // change within a version, and copying 22 MB on every dev start is rude.
    if (await exists(to)) {
      const [a, b] = await Promise.all([stat(from), stat(to)]);
      if (a.size === b.size) continue;
    }
    await copyFile(from, to);
    copied++;
  }
  return copied;
}

async function fetchModel() {
  await mkdir(modelOut, { recursive: true });
  const target = join(modelOut, MODEL.name);
  if (await exists(target)) {
    const { size } = await stat(target);
    if (size >= MODEL.minBytes) return false;
    console.warn(`[airboard-assets] ${MODEL.name} looks truncated (${size}b) — refetching`);
  }

  console.log(`[airboard-assets] downloading ${MODEL.name} (~7.8 MB)…`);
  const res = await fetch(MODEL.url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  // Write to a temp name first so an interrupted download can't leave a
  // half-file that looks valid to the next run.
  const tmp = `${target}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const { size } = await stat(tmp);
  if (size < MODEL.minBytes) {
    throw new Error(`Downloaded file is only ${size} bytes — expected ~7.8 MB.`);
  }
  const { rename } = await import("node:fs/promises");
  await rename(tmp, target);
  return true;
}

try {
  const copied = await copyWasm();
  const downloaded = await fetchModel();
  if (copied === 0 && !downloaded) {
    console.log("[airboard-assets] up to date");
  } else {
    console.log(
      `[airboard-assets] ready (${copied} wasm file${copied === 1 ? "" : "s"} copied${downloaded ? ", model downloaded" : ""})`,
    );
  }
} catch (err) {
  console.error(`\n[airboard-assets] ${err instanceof Error ? err.message : err}`);
  console.error(
    "Air Board will not start without these assets. Everything else in Chitra\n" +
      "still builds and runs — re-run `pnpm airboard:assets` once you have a\n" +
      "network connection.\n",
  );
  // Deliberately not a hard failure: a developer with no network should still
  // be able to build and work on the other 95% of the app.
  process.exit(0);
}
