import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project } from "@chitra/core";
import {
  exportInteractiveHtml,
  exportMarkdown,
  exportPdf,
  exportPng,
  exportSvg,
} from "../exports/runExport.js";

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

const ITEMS: Array<{
  id: "pdf" | "md" | "png" | "svg" | "html";
  label: string;
  hint: string;
  run: (p: Project) => Promise<string | null>;
}> = [
  { id: "pdf", label: "PDF", hint: "Print-ready document with cover snapshot", run: (p) => exportPdf(p) },
  { id: "md", label: "Markdown", hint: "Topologically ordered .md outline", run: (p) => exportMarkdown(p) },
  { id: "png", label: "PNG", hint: "High-DPI raster of the studio canvas", run: (p) => exportPng(p) },
  { id: "svg", label: "SVG", hint: "Vector snapshot of the studio canvas", run: (p) => exportSvg(p) },
  { id: "html", label: "Interactive HTML", hint: "Single-file shareable viewer", run: (p) => exportInteractiveHtml(p) },
];

export function ExportMenu({ project }: { project: Project }): JSX.Element {
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

  async function run(item: (typeof ITEMS)[number]): Promise<void> {
    setStatus({ kind: "busy", label: item.label });
    try {
      await item.run(project);
      setStatus({ kind: "idle" });
      setOpen(false);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
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
            className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d14] p-1 shadow-2xl shadow-black/50"
          >
            {ITEMS.map((it) => (
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
            {status.kind === "error" && (
              <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {status.message}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
