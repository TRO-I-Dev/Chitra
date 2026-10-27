import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * The desktop renderer *is* the web app.
 *
 * Rather than maintaining a parallel copy of the UI, this build points Vite's
 * root at `apps/web` and emits the result into `out/renderer`. Every feature
 * the PWA gains — Air Board included — ships on desktop the moment the desktop
 * bundle is rebuilt, with no porting step and no chance of the two drifting.
 *
 * The PWA plugin is deliberately absent: a service worker inside Electron adds
 * a stale-cache failure mode and buys nothing, since the app is already local.
 */
const webRoot = resolve(__dirname, "../web");

const pkg = JSON.parse(readFileSync(resolve(webRoot, "package.json"), "utf-8")) as {
  version: string;
};

/**
 * Content-Security-Policy for the packaged renderer.
 *
 * `wasm-unsafe-eval` is required — MediaPipe's vision runtime is WebAssembly,
 * and without it Air Board cannot instantiate the hand-landmark graph.
 * `blob:` covers the worker and the WASM glue MediaPipe spawns at runtime.
 * `media-src`/`img-src blob:` cover the camera stream and its preview frames.
 *
 * `unsafe-eval` is required by Excalidraw's lazy chunk, which compiles at
 * runtime via `new Function`. Without it the sketch layer dies with "Refused
 * to evaluate a string as JavaScript" — and because Air Board commits its ink
 * *into* that scene, every air stroke silently vanishes too.
 *
 * The usual argument against `unsafe-eval` is XSS reach. It is much weaker
 * here: this renderer loads no remote code (`script-src` has no third-party
 * origin), runs with `sandbox: true` + `contextIsolation: true` and no node
 * integration, is served from our own `app://` origin, and can't navigate
 * off-origin (`will-navigate` is blocked in the main process). The realistic
 * injection vector is content the user opened themselves, which is already
 * confined to that sandbox.
 */
const CSP = [
  "default-src 'self' app:",
  "script-src 'self' app: 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' app: blob:",
  "style-src 'self' app: 'unsafe-inline' https://rsms.me",
  "font-src 'self' app: data: https://rsms.me",
  "img-src 'self' app: data: blob:",
  "media-src 'self' app: blob: mediastream:",
  "connect-src 'self' app: data: blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
].join("; ");

/**
 * Injects the desktop CSP into the shared `index.html`.
 *
 * Kept as a build-time transform so `apps/web/index.html` stays free of
 * Electron-specific policy — the deployed PWA gets its headers from Netlify
 * instead, and the two can diverge without either file knowing about it.
 */
function injectDesktopCsp(): Plugin {
  return {
    name: "chitra-desktop-csp",
    transformIndexHtml: {
      order: "pre",
      handler(html: string) {
        return html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, "out/main"),
      rollupOptions: { input: resolve(__dirname, "src/main/index.ts") },
    },
    resolve: {
      alias: { "@shared": resolve(__dirname, "src/shared") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, "out/preload"),
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        // A sandboxed preload is always evaluated as CommonJS, whatever the
        // package `type` says. Emitting `.cjs` keeps that explicit — with
        // `"type": "module"` above, a `.js` preload would be read as ESM by
        // anything else that touches it.
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: webRoot,
    // Relative asset URLs so the bundle works under the custom `app://` scheme.
    base: "./",
    publicDir: resolve(webRoot, "public"),
    resolve: {
      alias: { "@": resolve(webRoot, "src") },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      "process.env.IS_PREACT": JSON.stringify("false"),
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV === "development" ? "development" : "production",
      ),
    },
    plugins: [react(), tailwind(), injectDesktopCsp()],
    build: {
      outDir: resolve(__dirname, "out/renderer"),
      target: "es2022",
      sourcemap: false,
      rollupOptions: {
        input: resolve(webRoot, "index.html"),
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom"],
            flow: ["@xyflow/react", "@dagrejs/dagre"],
            konva: ["konva", "react-konva"],
            excalidraw: ["@excalidraw/excalidraw"],
            docx: ["docx"],
            motion: ["framer-motion"],
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5674,
      strictPort: false,
    },
  },
});
