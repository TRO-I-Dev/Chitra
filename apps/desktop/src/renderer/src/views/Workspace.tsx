import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useProjectStore } from "../state/projectStore.js";
import { useTheme } from "../state/theme.js";
import { useMode, type WorkspaceMode } from "../state/mode.js";
import { Inbox } from "./Inbox.js";
import { Composer } from "./Composer.js";
import { Templates } from "./Templates.js";
import { ExportMenu } from "./ExportMenu.js";
import { Canvas } from "../canvas/Canvas.js";
import type { CardType } from "@chitra/core";

export function Workspace(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const path = useProjectStore((s) => s.path);
  const dirty = useProjectStore((s) => s.dirty);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const addCard = useProjectStore((s) => s.addCard);
  const removeCard = useProjectStore((s) => s.removeCard);
  const markSaved = useProjectStore((s) => s.markSaved);
  const closeProject = useProjectStore((s) => s.closeProject);
  const themeMode = useTheme((s) => s.mode);
  const toggleTheme = useTheme((s) => s.toggle);
  const workMode = useMode((s) => s.mode);
  const setWorkMode = useMode((s) => s.setMode);

  const [composerOpen, setComposerOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Global shortcuts: Ctrl+N (new card), Ctrl+S (save), Ctrl+Shift+S (save as)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setComposerOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveAs();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, path]);

  if (!project) return <div />;

  async function save(): Promise<void> {
    if (!project) return;
    if (!path) return saveAs();
    setSaving(true);
    setError(null);
    try {
      const res = await window.chitra.projectSave({ path, project });
      markSaved(res.path, res.savedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveAs(): Promise<void> {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const res = await window.chitra.projectSaveAs({ project });
      if (res) markSaved(res.path, res.savedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const fileLabel = path ? path.split(/[\\/]/).pop() : "Unsaved";

  return (
    <div className="flex h-full w-full flex-col">
      {/* Title bar */}
      <header className="titlebar relative flex h-10 shrink-0 items-center justify-between border-b border-white/5 bg-[#0a0a10] px-4 text-xs text-[var(--color-ink-dim)]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
          <span className="font-semibold text-[var(--color-ink)]">{project.name}</span>
          <span className="opacity-60">— {fileLabel}</span>
          {dirty && (
            <motion.span
              className="text-[var(--color-accent-2)]"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              ● unsaved
            </motion.span>
          )}
          {!dirty && lastSavedAt && (
            <span className="opacity-60">saved {timeAgo(lastSavedAt)}</span>
          )}
        </div>

        {/* Center mode strip */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <ModeStrip mode={workMode} onChange={setWorkMode} />
        </div>
        <div className="flex items-center gap-1.5">
          <BarBtn onClick={() => setTemplatesOpen(true)}>Templates</BarBtn>
          <ExportMenu project={project} />
          <BarBtn onClick={toggleTheme}>
            {themeMode === "studio" ? "◐ Calm" : "◑ Studio"}
          </BarBtn>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <BarBtn onClick={save} disabled={saving || !dirty}>
            Save
          </BarBtn>
          <BarBtn onClick={saveAs} disabled={saving}>
            Save as…
          </BarBtn>
          <BarBtn onClick={closeProject}>Close</BarBtn>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-400/30 bg-red-400/10 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Inbox
          cards={project.cards}
          onAddClick={() => setComposerOpen(true)}
          onDelete={(id) => removeCard(id)}
        />

        {/* Studio canvas */}
        <main className="relative flex flex-1 flex-col overflow-hidden">
          <BoardTabs />
          <div className="relative flex-1 overflow-hidden">
            <Canvas />
          </div>
        </main>
      </div>

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreate={({ title, type, bodyText }) => addCardWithBody(addCard, { title, type, bodyText })}
      />

      <Templates open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2.5 py-1 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function addCardWithBody(
  addCard: ReturnType<typeof useProjectStore.getState>["addCard"],
  args: { title: string; type: CardType; bodyText: string },
): void {
  addCard({
    title: args.title,
    type: args.type,
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: args.bodyText }] },
      ],
    },
  });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

function BoardTabs(): JSX.Element | null {
  const boards = useProjectStore((s) => s.project?.boards ?? []);
  const currentId = useProjectStore((s) => s.currentBoardId);
  const setCurrent = useProjectStore((s) => s.setCurrentBoard);
  if (boards.length === 0) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 bg-[#0a0a10]/80 px-3 backdrop-blur">
      {boards.map((b) => {
        const active = b.id === currentId;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => setCurrent(b.id)}
            className={[
              "relative rounded-md px-3 py-1 text-xs transition",
              active
                ? "bg-white/5 text-[var(--color-ink)]"
                : "text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            {active && (
              <motion.span
                layoutId="board-tab-underline"
                className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)]"
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
              />
            )}
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

function ModeStrip({
  mode,
  onChange,
}: {
  mode: WorkspaceMode;
  onChange: (m: WorkspaceMode) => void;
}): JSX.Element {
  const items: Array<{ value: WorkspaceMode; label: string; icon: string }> = [
    { value: "structure", label: "Structure", icon: "▣" },
    { value: "sketch", label: "Sketch", icon: "✎" },
  ];
  return (
    <div className="relative flex items-center rounded-full border border-white/10 bg-[#0d0d14]/90 p-0.5 text-[11px] backdrop-blur-md">
      {items.map((it) => {
        const active = mode === it.value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className="relative z-10 px-3 py-1 transition"
            style={{ color: active ? "#0b0b10" : "rgba(231,231,238,0.7)" }}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]"
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
              />
            )}
            <span className="mr-1">{it.icon}</span>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
