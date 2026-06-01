import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Excalidraw references `process.env.IS_PREACT` and `process.env.NODE_ENV`
    // at runtime; the browser has no `process` global, so these must be
    // statically replaced at build time or the lazy chunk throws
    // "process is not defined" on first import.
    "process.env.IS_PREACT": JSON.stringify("false"),
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV === "development" ? "development" : "production",
    ),
  },
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "autoUpdate",
      // Disable the SW in dev so HMR is never served from a stale cache.
      devOptions: { enabled: false },
      includeAssets: ["favicon.svg", "tsecond-logo.webp", "excalidraw-assets/**/*"],
      manifest: {
        name: "Chitra — Visual planning studio",
        short_name: "Chitra",
        description:
          "Turn writing into a beautiful plan. A local-first studio for architectures, business plans, and decisions.",
        theme_color: "#0b0b10",
        background_color: "#0b0b10",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Take control immediately so a new build replaces a stale SW
        // without a "click reload twice" dance. Old caches wiped on activate.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Excalidraw vendor chunks are large and lazy-loaded; runtime-cache only.
        globIgnores: [
          "**/excalidraw-assets/**",
          "**/excalidraw-assets-dev/**",
          "**/assets/excalidraw-*.js",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/excalidraw-assets\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "excalidraw-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/assets\/excalidraw-.*\.js$/i,
            handler: "CacheFirst",
            options: { cacheName: "excalidraw-chunk" },
          },
          {
            urlPattern: /^https:\/\/rsms\.me\//i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "fonts" },
          },
        ],
      },
    }),
    visualizer({ filename: "dist/stats.html", gzipSize: true }) as never,
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
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
    // Force IPv4 loopback — host:false lets Node try ::1 first, where
    // Hyper-V/WinNAT EACCES masks the real cause. Port 5179 (and many
    // ports in the 5100-5240 range) are reserved by Hyper-V on this host.
    host: "127.0.0.1",
    port: 5273,
    strictPort: false,
  },
});
