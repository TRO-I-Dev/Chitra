import { Component, lazy, Suspense } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";

// Excalidraw resolves its asset bundle (icons, fonts, lang JSON) relative to
// `window.EXCALIDRAW_ASSET_PATH`. Default is `https://unpkg.com/...`, which
// our strict CSP blocks. We ship the assets in the renderer's public/ folder
// (served from `/excalidraw-assets/`) so they're loaded same-origin.
//
// We resolve against `document.baseURI` so it works whether Vite is built
// with `base: "./"` (Electron) or `"/"` (web).
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const assetPath = new URL("excalidraw-assets/", document.baseURI).href;
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = assetPath;
}

// Dynamic import → put Excalidraw in its own chunk so initial load stays fast.
// We re-export `default` so React.lazy can consume it.
const Excalidraw = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return { default: mod.Excalidraw as unknown as ComponentType<Record<string, unknown>> };
});

export type LazyExcalidrawProps = ComponentProps<typeof Excalidraw>;

export function LazyExcalidraw(props: LazyExcalidrawProps): JSX.Element {
  return (
    <SketchErrorBoundary>
      <Suspense fallback={<SketchSpinner />}>
        <Excalidraw {...props} />
      </Suspense>
    </SketchErrorBoundary>
  );
}

function SketchSpinner(): JSX.Element {
  return (
    <div className="grid h-full w-full place-items-center text-xs text-[var(--color-ink-dim)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[var(--color-accent-2)]" />
        <span>Loading sketch tools…</span>
      </div>
    </div>
  );
}

interface SketchErrorBoundaryState {
  error: Error | null;
}

class SketchErrorBoundary extends Component<{ children: ReactNode }, SketchErrorBoundaryState> {
  state: SketchErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SketchErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // Surface to console for debugging without crashing the whole app.
    // eslint-disable-next-line no-console
    console.error("[Sketch] Failed to load Excalidraw:", error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid h-full w-full place-items-center p-6">
          <div className="max-w-sm rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-center text-xs text-rose-200">
            <div className="mb-1 text-sm font-semibold">Sketch tools failed to load</div>
            <div className="mb-3 text-rose-200/80">{this.state.error.message}</div>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-rose-400/40 px-3 py-1 text-rose-100 transition hover:bg-rose-400/10"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
