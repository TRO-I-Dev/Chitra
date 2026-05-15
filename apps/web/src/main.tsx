import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { bootstrapTheme } from "./state/theme.js";
import "./index.css";

bootstrapTheme();

// One-shot recovery: an early build registered a service worker that can
// keep serving stale chunks across reloads. If we detect that the running
// build is older than the marker below, unregister all SWs and purge their
// caches, then reload once. Safe no-op for clean installs.
const SW_RESET_KEY = "chitra:sw-reset-v2";
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if (!localStorage.getItem(SW_RESET_KEY)) {
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const had = regs.length > 0;
        await Promise.all(regs.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        localStorage.setItem(SW_RESET_KEY, "1");
        if (had) window.location.reload();
      } catch {
        localStorage.setItem(SW_RESET_KEY, "1");
      }
    })();
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
