import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { RecentProject } from "@chitra/core";

interface Props {
  onCreate: (name: string) => void;
  onOpen: (path?: string) => void;
  onSample: () => void;
}

export function Welcome({ onCreate, onOpen, onSample }: Props): JSX.Element {
  const [name, setName] = useState("");
  const [recents, setRecents] = useState<RecentProject[]>([]);

  useEffect(() => {
    window.chitra.recentsList().then(setRecents).catch(() => setRecents([]));
  }, []);

  return (
    <div className="studio-bg dot-grid flex h-full w-full items-center justify-center p-12">
      <div className="grid w-full max-w-5xl grid-cols-5 gap-8">
        {/* Hero / create */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="col-span-3 rounded-2xl border border-white/5 bg-white/[0.03] p-10 backdrop-blur-md"
        >
          <div className="mb-1 text-xs uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            Chitra Studio
          </div>
          <h1
            className="text-5xl font-semibold leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Turn writing into a beautiful plan.
          </h1>
          <p className="mt-4 max-w-md text-[var(--color-ink-dim)]">
            Drop in a thought — get a typed card. Arrange cards on the studio canvas to
            shape architectures, business plans, journeys, and decisions.
          </p>

          <form
            className="mt-8 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim() || "Untitled project";
              onCreate(n);
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name…"
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-[var(--color-ink-dim)]/60 focus:border-[var(--color-accent)]/60"
            />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Create project
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => onOpen()}
              className="text-sm text-[var(--color-ink-dim)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
            >
              …or open an existing .chitra file
            </button>
            <span className="text-[var(--color-ink-dim)]/40">·</span>
            <button
              type="button"
              onClick={onSample}
              className="text-sm text-[var(--color-ink-dim)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
            >
              …or try a sample project
            </button>
          </div>
        </motion.section>

        {/* Recents */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 24 }}
          className="col-span-2 rounded-2xl border border-white/5 bg-white/[0.02] p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide">Recent</h2>
            {recents.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await window.chitra.recentsClear();
                  setRecents([]);
                }}
                className="text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Clear
              </button>
            )}
          </div>
          {recents.length === 0 ? (
            <div className="text-sm text-[var(--color-ink-dim)]">
              Your recent projects will show up here.
            </div>
          ) : (
            <ul className="space-y-1">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.path)}
                    className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.04]"
                  >
                    <div className="text-sm font-medium text-[var(--color-ink)]">{r.name}</div>
                    <div className="truncate text-xs text-[var(--color-ink-dim)]">{r.path}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.aside>
      </div>
    </div>
  );
}
