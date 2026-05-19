import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card } from "@chitra/core";
import { useProjectStore } from "../state/projectStore.js";

function bodyToText(body: Card["body"]): string {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(body);
  return out.join(" ").trim();
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a card id when the user clicks "Open" — Workspace navigates
   *  to the first board that contains the card and opens the inspector. */
  onOpenCard: (cardId: string) => void;
}

/**
 * Cross-board ledger of every decision card. Sorted newest first by
 * `updatedAt`. Filters by free-text search across title + body.
 */
export function DecisionLog({ open, onClose, onOpenCard }: Props): JSX.Element | null {
  const project = useProjectStore((s) => s.project);

  const decisions = useMemo(() => {
    if (!project) return [];
    return project.cards
      .filter((c) => c.type === "decision")
      .map((c) => ({ card: c, boards: project.boards.filter((b) => b.nodes.some((n) => n.cardId === c.id)) }))
      .sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt));
  }, [project]);

  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        key="decision-log"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">Decision Log</div>
              <div className="text-sm font-semibold">{decisions.length} decision{decisions.length === 1 ? "" : "s"}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
              aria-label="Close"
            >×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {decisions.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-[var(--color-ink-dim)]">
                No decision cards yet. Create a card and set its type to <em>decision</em>.
              </div>
            ) : (
              <ul className="space-y-2">
                {decisions.map(({ card, boards }) => (
                  <li
                    key={card.id}
                    className="rounded-xl border border-white/10 bg-black/30 p-3 transition hover:border-[var(--color-accent)]/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{card.title}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">
                          {new Date(card.updatedAt).toLocaleString()}
                          {boards.length > 0 && (
                            <span> · {boards.map((b) => b.name).join(", ")}</span>
                          )}
                          {card.tags.length > 0 && (
                            <span> · {card.tags.map((t) => `#${t}`).join(" ")}</span>
                          )}
                        </div>
                        <div className="mt-1.5 line-clamp-3 text-xs text-[var(--color-ink-dim)]">
                          {bodyToText(card.body) || <em>(no body)</em>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { onOpenCard(card.id); onClose(); }}
                        className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
                      >Open</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
