import { useEffect, useState } from "react";
import { useProjectStore } from "../state/projectStore.js";
import { Inbox } from "./Inbox.js";
import { Composer } from "./Composer.js";
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

  const [composerOpen, setComposerOpen] = useState(false);
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
      <header className="titlebar flex h-10 shrink-0 items-center justify-between border-b border-white/5 bg-[#0a0a10] px-4 text-xs text-[var(--color-ink-dim)]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
          <span className="font-semibold text-[var(--color-ink)]">{project.name}</span>
          <span className="opacity-60">— {fileLabel}</span>
          {dirty && <span className="text-[var(--color-accent-2)]">● unsaved</span>}
          {!dirty && lastSavedAt && (
            <span className="opacity-60">saved {timeAgo(lastSavedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
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

        {/* Studio canvas placeholder until Phase 2 */}
        <main className="studio-bg dot-grid relative flex-1">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-3 text-5xl opacity-30">◇ ◆ ◇</div>
              <p className="max-w-md text-sm text-[var(--color-ink-dim)]">
                The studio canvas lands in <span className="text-[var(--color-ink)]">Phase 2</span>.
                For now, compose cards on the left — they're persisted in your{" "}
                <code className="text-[var(--color-ink)]">.chitra</code> project file.
              </p>
            </div>
          </div>
        </main>
      </div>

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreate={({ title, type, bodyText }) => addCardWithBody(addCard, { title, type, bodyText })}
      />
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
