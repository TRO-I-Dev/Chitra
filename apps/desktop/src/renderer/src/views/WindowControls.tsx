import { useEffect, useState } from "react";

/**
 * Custom Windows-style minimize / maximize / close buttons for the
 * frameless title bar. macOS uses native traffic lights via
 * `titleBarStyle: "hiddenInset"`, so we hide ours there.
 */
export function WindowControls(): JSX.Element | null {
  const [isMax, setIsMax] = useState(false);
  const isMac = navigator.platform.toLowerCase().includes("mac");

  useEffect(() => {
    if (isMac) return;
    void window.chitra.win.isMaximized().then(setIsMax);
    const off = window.chitra.win.onMaximizeChange(setIsMax);
    return off;
  }, [isMac]);

  if (isMac) return null;

  return (
    <div className="flex items-center" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <CtlBtn onClick={() => void window.chitra.win.minimize()} title="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5 H10" stroke="currentColor" /></svg>
      </CtlBtn>
      <CtlBtn onClick={() => void window.chitra.win.maxToggle()} title={isMax ? "Restore" : "Maximize"}>
        {isMax ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.5" y="2.5" width="6" height="6" stroke="currentColor" />
            <path d="M3.5 2.5 V0.5 H9.5 V6.5 H7.5" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
          </svg>
        )}
      </CtlBtn>
      <CtlBtn onClick={() => void window.chitra.win.close()} title="Close" danger>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" /></svg>
      </CtlBtn>
    </div>
  );
}

function CtlBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "grid h-10 w-11 place-items-center text-[var(--color-ink-dim)] transition",
        danger
          ? "hover:bg-red-500 hover:text-white"
          : "hover:bg-white/10 hover:text-[var(--color-ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
