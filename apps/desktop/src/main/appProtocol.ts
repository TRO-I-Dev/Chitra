import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

/**
 * The `app://` scheme that serves the packaged renderer.
 *
 * `file://` would be simpler, but it is a null origin: `fetch()` against it is
 * blocked, which breaks MediaPipe outright (Air Board's WASM runtime and the
 * 7.8 MB hand model are both fetched, not `<script>`-loaded). A privileged
 * custom scheme gives the renderer a real, secure origin — so `fetch`, WASM
 * streaming instantiation, service-worker-free caching and the camera
 * permission model all behave exactly as they do on the web build.
 */
export const APP_SCHEME = "app";
export const APP_ORIGIN = `${APP_SCHEME}://chitra`;
export const APP_INDEX = `${APP_ORIGIN}/index.html`;

/** Must be called before `app.whenReady()`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Call once the app is ready. `rendererDir` is the built `out/renderer`. */
export function serveRenderer(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    // The URL parser resolves plain `../` segments before we see them, but
    // percent-encoded ones (`%2e%2e`) survive until this decode — so the
    // containment check below is what actually stops directory traversal.
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = normalize(join(rendererDir, relative || "index.html"));
    if (target !== rendererDir && !target.startsWith(rendererDir + sep)) {
      console.warn(`[app://] blocked traversal attempt: ${url.pathname}`);
      return new Response("Forbidden", { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      // A missing file otherwise surfaces as net::ERR_UNEXPECTED, which tells
      // nobody anything. A real 404 does.
      return new Response("Not found", { status: 404 });
    }
  });
}
