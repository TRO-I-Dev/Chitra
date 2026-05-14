import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@chitra/core", "@chitra/composer", "@chitra/templates", "@chitra/exports"] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
    resolve: {
      alias: {
        "@main": resolve(__dirname, "src/main"),
      },
    },
  },
  preload: {
    // No externalizeDepsPlugin: sandboxed preloads cannot require() from
    // node_modules — every dep (zod, @chitra/*) must be bundled into the
    // preload script itself.
    build: {
      // Sandboxed preloads must be CommonJS — Electron does not support ESM
      // preload scripts when `sandbox: true`. Force CJS output (.js, not .mjs).
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwind()],
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    server: {
      port: 5179,
    },
  },
});
