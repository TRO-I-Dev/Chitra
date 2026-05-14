import { lazy, Suspense } from "react";
import type { ComponentProps, ComponentType } from "react";

// Excalidraw resolves its asset bundle (icons, fonts, lang JSON) relative to
// `window.EXCALIDRAW_ASSET_PATH`. Default is `https://unpkg.com/...`, which
// our strict CSP blocks. We ship the assets in the renderer's public/ folder
// so they're served from the same origin.
if (typeof window !== "undefined") {
  // Cast: this property is not in the lib typings.
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/";
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
    <Suspense fallback={<SketchSpinner />}>
      <Excalidraw {...props} />
    </Suspense>
  );
}

function SketchSpinner(): JSX.Element {
  return (
    <div className="grid h-full w-full place-items-center text-xs text-[var(--color-ink-dim)]">
      Loading sketch tools…
    </div>
  );
}
