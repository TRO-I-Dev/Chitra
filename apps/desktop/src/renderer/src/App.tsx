import { useEffect, useState } from "react";

interface VersionInfo {
  version: string;
  electron: string;
  node: string;
}

export function App(): JSX.Element {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.chitra
      .appVersion()
      .then(setVersion)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="studio-bg dot-grid flex h-full w-full flex-col">
      <header className="titlebar flex h-10 shrink-0 items-center justify-between px-4 text-sm text-[var(--color-ink-dim)]">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
          <span className="font-medium tracking-wide text-[var(--color-ink)]">Chitra</span>
          <span className="opacity-60">— writing → cards → flows</span>
        </div>
        <div className="opacity-60">{version ? `v${version.version}` : ""}</div>
      </header>

      <main className="flex flex-1 items-center justify-center">
        <div className="max-w-xl rounded-2xl border border-white/5 bg-white/[0.03] p-10 text-center backdrop-blur-md">
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome to Chitra
          </h1>
          <p className="mt-3 text-[var(--color-ink-dim)]">
            Phase 0 shell is alive. The composer, studio, and exporters are landing in the
            following phases.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-[var(--color-ink-dim)]">
            <Stat label="App" value={version?.version ?? "…"} />
            <Stat label="Electron" value={version?.electron ?? "…"} />
            <Stat label="Node" value={version?.node ?? "…"} />
          </div>

          {error && (
            <p className="mt-6 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-left text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)]/70">
        <span>Phase 0 · bootstrap</span>
        <span>local · offline · private</span>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-1 font-mono text-sm text-[var(--color-ink)]">{value}</div>
    </div>
  );
}
