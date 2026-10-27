import { Suspense, lazy, useEffect } from "react";
import { useAirBoard } from "./airBoardStore.js";

/**
 * Lazy entry point for Air Board.
 *
 * The overlay pulls in the MediaPipe glue and, on first run, ~19 MB of WASM +
 * model weights. None of that should touch a user who never opens Air Board,
 * so the whole feature lives behind a dynamic import and only activates once
 * this component is actually mounted (i.e. the board is in `air` mode).
 */
const AirBoardOverlay = lazy(() =>
  import("./AirBoardOverlay.js").then((m) => ({ default: m.AirBoardOverlay })),
);

export function LazyAirBoard(): JSX.Element {
  const setActive = useAirBoard((s) => s.setActive);

  useEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);

  return (
    <Suspense fallback={null}>
      <AirBoardOverlay />
    </Suspense>
  );
}
