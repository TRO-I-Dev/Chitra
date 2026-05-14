import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project } from "@chitra/core";
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

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "ok"; label: string; path: string | null }
  | { kind: "error"; message: string };

const ITEMS: Array<{
  id: string;
  group: "Files" | "Publish";
  label: string;
  hint: string;
  run: (p: Project) => Promise<string | null>;
}> = [
  { id: "pdf", group: "Files", label: "PDF", hint: "Print-ready document with cover snapshot", run: (p) => exportPdf(p) },
  { id: "docx", group: "Files", label: "Word (.docx)", hint: "Editable document with headings + bullets", run: (p) => exportDocx(p) },
  { id: "md", group: "Files", label: "Markdown", hint: "Topologically ordered .md outline", run: (p) => exportMarkdown(p) },
  { id: "png", group: "Files", label: "PNG", hint: "High-DPI raster of the studio canvas", run: (p) => exportPng(p) },
  { id: "svg", group: "Files", label: "SVG", hint: "Vector snapshot of the studio canvas", run: (p) => exportSvg(p) },
  { id: "html", group: "Files", label: "Interactive HTML", hint: "Single-file shareable viewer", run: (p) => exportInteractiveHtml(p) },
  { id: "notion", group: "Publish", label: "Notion", hint: "Create a page under your configured parent", run: (p) => publishNotion(p) },
  { id: "confluence", group: "Publish", label: "Confluence", hint: "Create a page in your configured space", run: (p) => publishConfluence(p) },
];

export function ExportMenu({
  project,
  onOpenSettings,
}: {
  project: Project;
  onOpenSettings: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Auto-clear success toast.
  useEffect(() => {
    if (status.kind !== "ok") return;
    const t = setTimeout(() => setStatus({ kind: "idle" }), 4000);
    return () => clearTimeout(t);
  }, [status]);

  async function run(item: (typeof ITEMS)[number]): Promise<void> {
    setStatus({ kind: "busy", label: item.label });
    try {
      const result = await item.run(project);
      setStatus({ kind: "ok", label: item.label, path: result });
      setOpen(false);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const groups = ITEMS.reduce<Record<string, typeof ITEMS>>((acc, it) => {
    (acc[it.group] ??= []).push(it);
    return acc;
  }, {});

  return (
    <>
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={status.kind === "busy"}
          className="rounded-md px-2.5 py-1 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          {status.kind === "busy" ? `Exporting ${status.label}…` : "Export ▾"}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d14] p-1 shadow-2xl shadow-black/50"
            >
              {Object.entries(groups).map(([group, items]) => (
                <div key={group} className="px-1 py-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-dim)]">
                    {group}
                  </div>
                  {items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => void run(it)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <span className="text-xs font-semibold text-[var(--color-ink)]">{it.label}</span>
                      <span className="text-[11px] text-[var(--color-ink-dim)]">{it.hint}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="border-t border-white/5 px-1 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
                >
                  <span>Configure publishing…</span>
                  <span>⚙</span>
                </button>
              </div>
              {status.kind === "error" && (
                <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  {status.message}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {status.kind === "ok" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200 shadow-xl shadow-black/40"
          >
            ✔ {status.label} exported{status.path ? ` → ${status.path}` : ""}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
