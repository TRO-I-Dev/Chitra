import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LogoLockup, TsecondMark } from "../brand/Logo.js";
import { listRaw, clear as clearRecents, togglePin as togglePinRecent } from "../platform/recents.js";

type RecentEntry = Awaited<ReturnType<typeof listRaw>>[number];

interface Props {
  onCreate: (name: string) => void;
  onOpen: (handleId?: string | null) => void;
  onSample: () => void;
}

const PILLARS: { kicker: string; title: string; body: string }[] = [
  {
    kicker: "01",
    title: "Capture",
    body: "Type or paste a thought. Get a typed, structured card you can move and connect.",
  },
  {
    kicker: "02",
    title: "Compose",
    body: "Wire cards on a studio canvas. Switch to sketch mode for free-hand annotation.",
  },
  {
    kicker: "03",
    title: "Ship",
    body: "Export to PNG, SVG, JSON, Mermaid, Word, Confluence, Notion — one click each.",
  },
];

function fmtRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function Welcome({ onCreate, onOpen, onSample }: Props): JSX.Element {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0;
  const showHint = touched && !canCreate;

  useEffect(() => {
    listRaw().then(setRecents).catch(() => setRecents([]));
  }, []);

  const version = useMemo(() => {
    try {
      return (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "";
    } catch {
      return "";
    }
  }, []);

  return (
    <div className="studio-bg relative h-full w-full overflow-y-auto">
      {/* ── Background field ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
        <div
          className="absolute left-1/2 top-0 h-[640px] w-[1200px] -translate-x-1/2 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,92,255,0.18), transparent 70%)",
          }}
        />
        <div
          className="absolute left-1/2 top-[420px] h-[520px] w-[1040px] -translate-x-1/2 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(33,212,253,0.12), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 35%, black 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 35%, black 40%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-8 md:px-10 md:py-10">
        {/* ── Top brand bar ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between pb-8">
          <LogoLockup markSize={30} wordSize="md" />
          <TsecondMark size={22} withWordmark={false} />
        </header>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="mx-auto mt-16 flex w-full max-w-3xl flex-col items-center text-center md:mt-24"
        >
          <h1
            className="text-balance text-[44px] font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-[60px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Turn writing into a{" "}
            <span
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--color-accent), var(--color-accent-2))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              beautiful plan
            </span>
            .
          </h1>

          <p className="mt-5 max-w-lg text-pretty text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
            A local-first studio for architectures, business plans, journeys
            and decisions. Save to a single{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px]">.chitra</code>{" "}
            file you fully own.
          </p>

          {/* Create form */}
          <form
            className="mt-9 w-full max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!canCreate) return;
              onCreate(trimmedName);
            }}
          >
            <div
              className={[
                "flex items-center gap-1.5 rounded-2xl border bg-black/40 p-1.5 transition",
                canCreate
                  ? "border-[var(--color-accent)]/55 shadow-[0_0_0_4px_rgba(124,92,255,0.12)]"
                  : showHint
                    ? "border-rose-400/60"
                    : "border-white/10 focus-within:border-white/25",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[var(--color-ink-dim)]"
              >
                ✦
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Name your project…"
                aria-invalid={showHint}
                className="flex-1 bg-transparent px-1 py-2.5 text-base outline-none placeholder:text-[var(--color-ink-dim)]/55"
              />
              <button
                type="submit"
                disabled={!canCreate}
                className="rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-[rgba(124,92,255,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
              >
                Create →
              </button>
            </div>
            <div
              className={`mt-2.5 text-center text-xs transition-opacity ${
                showHint
                  ? "text-rose-300/90 opacity-100"
                  : "text-[var(--color-ink-dim)]/70 opacity-90"
              }`}
            >
              {showHint
                ? "Give your project a name to continue."
                : canCreate
                  ? "Press Enter to open your studio."
                  : "A project name unlocks the studio canvas."}
            </div>
          </form>

          {/* Secondary actions */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <ActionChip onClick={() => onOpen()} icon="📂">
              Open .chitra file
            </ActionChip>
            <ActionChip onClick={onSample} icon="✨">
              Try a sample project
            </ActionChip>
          </div>
        </motion.section>

        {/* ── Pillars ───────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 24 }}
          className="mt-20 grid grid-cols-1 gap-10 md:mt-28 md:grid-cols-3 md:gap-12"
        >
          {PILLARS.map((p) => (
            <div key={p.kicker} className="flex flex-col gap-2.5">
              <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-[var(--color-ink-dim)]/70">
                {p.kicker}
              </span>
              <div
                className="text-base font-semibold text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {p.title}
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                {p.body}
              </p>
            </div>
          ))}
        </motion.section>

        {/* ── Recents ───────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, type: "spring", stiffness: 220, damping: 24 }}
          className="mt-12 md:mt-16"
        >
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-dim)]">
                Recent projects
              </h2>
              <p className="mt-1 text-[12px] text-[var(--color-ink-dim)]/70">
                {recents.length === 0
                  ? "Once you create or open a project, it'll appear here."
                  : `${recents.length} project${recents.length === 1 ? "" : "s"} on this device`}
              </p>
            </div>
            {recents.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await clearRecents();
                  setRecents([]);
                }}
                className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-dim)] transition hover:text-[var(--color-ink)]"
              >
                Clear
              </button>
            )}
          </div>

          {recents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] px-6 py-10 text-center text-sm text-[var(--color-ink-dim)]">
              No projects yet — start one above, or try the sample.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recents.slice(0, 6).map((r) => (
                <li key={r.path + (r.handleId ?? "")} className="relative">
                  <button
                    type="button"
                    onClick={() => onOpen(r.handleId)}
                    className="group flex h-full w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-left transition hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05]"
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-[14px] text-[var(--color-accent-2)] transition group-hover:border-[var(--color-accent-2)]/40"
                    >
                      ◈
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                        {r.name}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--color-ink-dim)]">
                        {r.path}
                      </span>
                    </span>
                    {r.lastOpenedAt && (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]/70">
                        {fmtRelative(r.lastOpenedAt)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    title={r.pinned ? "Unpin" : "Pin to top"}
                    aria-label={r.pinned ? "Unpin recent" : "Pin recent"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await togglePinRecent(r.id);
                      listRaw().then(setRecents).catch(() => setRecents([]));
                    }}
                    className={[
                      "absolute right-2 top-2 rounded-md p-1 text-xs transition",
                      r.pinned
                        ? "text-[var(--color-accent-2)] hover:bg-white/10"
                        : "text-[var(--color-ink-dim)]/60 opacity-0 hover:bg-white/10 hover:text-[var(--color-ink)] group-hover:opacity-100",
                    ].join(" ")}
                  >
                    {r.pinned ? "★" : "☆"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <footer className="mt-16 flex items-center justify-between gap-3 pt-6 text-[11px] text-[var(--color-ink-dim)]/70 md:mt-24">
          <span>{version ? `v${version}` : ""}</span>
          <TsecondMark size={18} withWordmark={false} />
        </footer>
      </div>
    </div>
  );
}

function ActionChip({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-[var(--color-ink-dim)] transition hover:border-white/25 hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}
