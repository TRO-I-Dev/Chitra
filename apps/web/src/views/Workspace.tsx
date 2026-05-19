import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useProjectStore } from "../state/projectStore.js";
import { useTheme } from "../state/theme.js";
import { useMode, type WorkspaceMode } from "../state/mode.js";
import { Inbox } from "./Inbox.js";
const Composer = lazy(() => import("./Composer.js").then((m) => ({ default: m.Composer })));
import { LogoMark, Wordmark } from "../brand/Logo.js";
const Templates = lazy(() => import("./Templates.js").then((m) => ({ default: m.Templates })));
const ExportMenu = lazy(() => import("./ExportMenu.js").then((m) => ({ default: m.ExportMenu })));
const Settings = lazy(() => import("./Settings.js").then((m) => ({ default: m.Settings })));
import { CardInspector } from "./CardInspector.js";
import { Canvas } from "../canvas/Canvas.js";
import {
  exportDocx,
  exportInteractiveHtml,
  exportMarkdown,
  exportPdf,
  exportPng,
  exportSvg,
  publishConfluence,
  publishNotion,
} from "../exports/runExport.js";
import { platform } from "../platform/index.js";
import type { Card, CardType, Project } from "@chitra/core";

export function Workspace(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const path = useProjectStore((s) => s.path);
  const handleId = useProjectStore((s) => s.handleId);
  const dirty = useProjectStore((s) => s.dirty);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const addCard = useProjectStore((s) => s.addCard);
  const addNodeFromCard = useProjectStore((s) => s.addNodeFromCard);
  const removeCard = useProjectStore((s) => s.removeCard);
  const markSaved = useProjectStore((s) => s.markSaved);
  const closeProject = useProjectStore((s) => s.closeProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const themeMode = useTheme((s) => s.mode);
  const toggleTheme = useTheme((s) => s.toggle);
  const workMode = useMode((s) => s.mode);
  const setWorkMode = useMode((s) => s.setMode);

  const [composerOpen, setComposerOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorCardId, setInspectorCardId] = useState<string | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addAtCenterRef = useRef<((cardId: string) => void) | null>(null);

  // Global shortcuts: Ctrl+N (new card), Ctrl+S (save), Ctrl+Shift+S (save as),
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (undo/redo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when an input/textarea/contenteditable owns focus.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        const k = e.key.toLowerCase();
        // Still allow save in inputs.
        if (!((e.ctrlKey || e.metaKey) && (k === "s" || k === "z" || k === "y"))) return;
      }
      const cmd = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (cmd && k === "n") {
        e.preventDefault();
        setComposerOpen(true);
      } else if (cmd && e.shiftKey && k === "s") {
        e.preventDefault();
        void saveAs();
      } else if (cmd && k === "s") {
        e.preventDefault();
        void save();
      } else if (cmd && e.shiftKey && k === "z") {
        e.preventDefault();
        redo();
      } else if (cmd && k === "z") {
        e.preventDefault();
        undo();
      } else if (cmd && k === "y") {
        e.preventDefault();
        redo();
      } else if (cmd && k === "1") {
        e.preventDefault();
        setWorkMode("structure");
      } else if (cmd && k === "2") {
        e.preventDefault();
        setWorkMode("sketch");
      } else if (k === "[" && !cmd) {
        // Collapse / hide the docked inspector.
        if (inspectorCardId && !inspectorCollapsed) {
          e.preventDefault();
          setInspectorCollapsed(true);
        }
      } else if (k === "]" && !cmd) {
        // Reveal the docked inspector (if a card is open).
        if (inspectorCardId && inspectorCollapsed) {
          e.preventDefault();
          setInspectorCollapsed(false);
        }
      } else if (k === "escape") {
        if (inspectorCardId) setInspectorCardId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, path, inspectorCardId]);

  // Auto-save every 60s when the project has a save target and is dirty.
  useEffect(() => {
    if (!handleId) return;
    const id = window.setInterval(() => {
      if (useProjectStore.getState().dirty) void save();
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleId]);

  // First-time-per-session sketch-mode hint so the user knows the overlay
  // captures pointer events and they can draw freely.
  const sketchHintShownRef = useRef(false);
  useEffect(() => {
    if (workMode !== "sketch") return;
    if (sketchHintShownRef.current) return;
    sketchHintShownRef.current = true;
    toast("Sketch mode — draw freely on top of the canvas", {
      description: "Press Ctrl+1 to return to Structure.",
      duration: 3500,
    });
  }, [workMode]);

  // Native menu → renderer actions.
  useEffect(() => {
    const off = platform.onMenu((action) => {
      switch (action) {
        case "new-card":
          setComposerOpen(true);
          break;
        case "save":
          void save();
          break;
        case "save-as":
          void saveAs();
          break;
        case "close-project":
          closeProject();
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
        case "open-templates":
          setTemplatesOpen(true);
          break;
        case "open-settings":
          setSettingsOpen(true);
          break;
        case "toggle-theme":
          toggleTheme();
          break;
        case "show-onboarding":
          try { localStorage.removeItem("chitra.onboarded.v1"); } catch { /* ignore */ }
          window.location.reload();
          break;
        case "mode-structure":
          setWorkMode("structure");
          break;
        case "mode-sketch":
          setWorkMode("sketch");
          break;
        default:
          if (action.startsWith("export-") || action.startsWith("publish-")) {
            void runExportCommand(action);
          }
          break;
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, path]);

  async function runExportCommand(action: string): Promise<void> {
    if (!project) return;
    const proj: Project = project;
    const map: Record<string, ((p: Project) => Promise<string | null>) | undefined> = {
      "export-markdown": exportMarkdown,
      "export-html": exportInteractiveHtml,
      "export-png": exportPng,
      "export-svg": exportSvg,
      "export-pdf": exportPdf,
      "export-docx": exportDocx,
      "publish-notion": publishNotion,
      "publish-confluence": publishConfluence,
    };
    const fn = map[action];
    if (!fn) return;
    try {
      const result = await fn(proj);
      toast.success(result ? `${action.replace(/^(export|publish)-/, "")} → ${result}` : "Done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  }

  if (!project) return <div />;

  async function save(): Promise<void> {
    if (!project) return;
    if (!handleId) return saveAs();
    setSaving(true);
    setError(null);
    try {
      const res = await platform.projectSave(handleId, project);
      markSaved(res.path, res.savedAt, res.handleId);
      toast.success("Saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function saveAs(): Promise<void> {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const res = await platform.projectSaveAs(project);
      if (res) {
        markSaved(res.path, res.savedAt, res.handleId);
        toast.success(`Saved as ${res.path}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const fileLabel = path ? path.split(/[\\/]/).pop() : "Unsaved";

  return (
    <div className="flex h-full w-full flex-col">
      {/* Title bar — 3-col grid so the center mode strip never collides with
          the side action groups (left growable, center auto, right growable). */}
      <header className="titlebar grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/5 bg-[#0a0a10] px-4 text-xs text-[var(--color-ink-dim)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <LogoMark size={18} />
            <Wordmark size="sm" className="text-[var(--color-ink)]" />
          </div>
          <span className="shrink-0 opacity-30">·</span>
          <span className="truncate font-semibold text-[var(--color-ink)]" title={project.name}>
            {project.name}
          </span>
          <span className="hidden truncate opacity-60 md:inline" title={fileLabel ?? undefined}>
            — {fileLabel}
          </span>
          {dirty ? (
            <motion.span
              className="shrink-0 text-[var(--color-accent-2)]"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              ● unsaved
            </motion.span>
          ) : lastSavedAt ? (
            <span className="hidden shrink-0 opacity-60 lg:inline">saved {timeAgo(lastSavedAt)}</span>
          ) : null}
        </div>

        {/* Center mode strip — naturally centered by the grid track. */}
        <div className="flex items-center justify-center">
          <ModeStrip mode={workMode} onChange={setWorkMode} />
        </div>

        <div className="flex items-center justify-end gap-1">
          <BarBtn onClick={() => setTemplatesOpen(true)}>Templates</BarBtn>
          <Suspense fallback={null}>
            <ExportMenu project={project} onOpenSettings={() => setSettingsOpen(true)} />
          </Suspense>
          <BarBtn onClick={() => setSettingsOpen(true)} title="Settings">⚙</BarBtn>
          <BarBtn onClick={toggleTheme} title="Toggle theme">
            {themeMode === "studio" ? "◐" : "◑"}
          </BarBtn>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <BarBtn onClick={save} disabled={saving || !dirty}>
            Save
          </BarBtn>
          <BarBtn onClick={saveAs} disabled={saving} title="Save as…">
            Save as
          </BarBtn>
          <BarBtn onClick={closeProject} title="Close project">Close</BarBtn>
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
          edges={project.boards.flatMap((b) =>
            b.edges.map((e) => ({ kind: e.kind, source: e.source, target: e.target })),
          )}
          onAddClick={() => setComposerOpen(true)}
          onDelete={(id) => removeCard(id)}
          onOpen={(id) => { setInspectorCardId(id); setInspectorCollapsed(false); }}
          onAddToCanvas={(id) => addAtCenterRef.current?.(id)}
        />

        {/* Studio canvas */}
        <main className="relative flex flex-1 flex-col overflow-hidden">
          <BoardTabs />
          <div className="relative flex-1 overflow-hidden">
            <Canvas
              onOpenCard={(id) => { setInspectorCardId(id); setInspectorCollapsed(false); }}
              registerAddAtCenter={(fn) => {
                addAtCenterRef.current = fn;
              }}
            />
          </div>
        </main>
      </div>

      <Suspense fallback={null}>
        <Composer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onCreate={({ title, type, bodyText }) => {
            const card = addCardWithBody(addCard, { title, type, bodyText });
            window.requestAnimationFrame(() => {
              if (addAtCenterRef.current) addAtCenterRef.current(card.id);
              else addNodeFromCard(card.id, { x: 0, y: 0 });
            });
          }}
        />
        <Templates open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
        <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Suspense>
      <CardInspector
        card={inspectorCardId ? project.cards.find((c) => c.id === inspectorCardId) ?? null : null}
        collapsed={inspectorCollapsed}
        onClose={() => setInspectorCardId(null)}
      />

      {/* Status footer */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-white/5 bg-[#0a0a10] px-3 text-[10px] text-[var(--color-ink-dim)]">
        <div className="flex items-center gap-3">
          <span>{project.cards.length} cards · {project.boards.length} board{project.boards.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span><kbd className="rounded bg-white/5 px-1">Ctrl+N</kbd> compose</span>
          <span><kbd className="rounded bg-white/5 px-1">Ctrl+Z</kbd> undo</span>
          <span><kbd className="rounded bg-white/5 px-1">Ctrl+S</kbd> save</span>
          <span><kbd className="rounded bg-white/5 px-1">Ctrl+T</kbd> templates</span>
        </div>
      </footer>
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md px-2 py-1 text-xs text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function addCardWithBody(
  addCard: ReturnType<typeof useProjectStore.getState>["addCard"],
  args: { title: string; type: CardType; bodyText: string },
): Card {
  return addCard({
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
  const addBoard = useProjectStore((s) => s.addBoard);
  const renameBoard = useProjectStore((s) => s.renameBoard);
  const removeBoard = useProjectStore((s) => s.removeBoard);
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
            onDoubleClick={() => {
              const name = prompt("Rename board", b.name);
              if (name !== null) renameBoard(b.id, name);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (boards.length > 1 && confirm(`Delete board “${b.name}”?`)) removeBoard(b.id);
            }}
            className={[
              "relative rounded-md px-3 py-1 text-xs transition",
              active
                ? "bg-white/5 text-[var(--color-ink)]"
                : "text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]",
            ].join(" ")}
            title="Double-click to rename, right-click to delete"
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
      <button
        type="button"
        onClick={() => addBoard()}
        title="New empty board"
        className="ml-1 rounded-md px-2 py-1 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
      >
        + Board
      </button>
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
  const items: Array<{ value: WorkspaceMode; label: string; icon: string; hint: string }> = [
    { value: "structure", label: "Structure", icon: "▣", hint: "Ctrl+1" },
    { value: "sketch", label: "Sketch", icon: "✎", hint: "Ctrl+2" },
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
            title={`${it.label} (${it.hint})`}
            className="relative z-10 flex items-center gap-1.5 px-3 py-1 transition"
            style={{ color: active ? "#0b0b10" : "rgba(231,231,238,0.7)" }}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]"
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
              />
            )}
            <span aria-hidden="true">{it.icon}</span>
            <span className="font-medium">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
