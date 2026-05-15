import { useMemo, useState } from "react";
import type { Card } from "@chitra/core";
import { AnimatePresence } from "framer-motion";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  getCardStatus,
  getCardPriority,
  resolveCardStyle,
} from "../cardStyles.js";
import { CARD_DRAG_MIME, clearDraggedCardId, setDraggedCardId } from "../dragState.js";

interface Props {
  cards: Card[];
  onAddClick: () => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onAddToCanvas?: (id: string) => void;
}

export function Inbox({ cards, onAddClick, onDelete, onOpen, onAddToCanvas }: Props): JSX.Element {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      if (c.type.toLowerCase().includes(q)) return true;
      if (c.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return flattenBody(c).toLowerCase().includes(q);
    });
  }, [cards, query]);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-white/5 bg-[#0d0d14]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            Inbox
          </div>
          <div className="text-sm font-semibold">
            {filtered.length}
            {filtered.length !== cards.length && (
              <span className="text-[var(--color-ink-dim)]"> / {cards.length}</span>
            )}{" "}
            cards
          </div>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110"
          title="New card (Ctrl+N)"
        >
          + New
        </button>
      </div>

      {cards.length > 0 && (
        <div className="border-b border-white/5 px-3 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, body, type, tag…"
            className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs outline-none placeholder:text-[var(--color-ink-dim)]/60 focus:border-[var(--color-accent)]/60"
          />
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--color-ink-dim)]">
          <div className="mb-2 text-3xl">✎</div>
          <p>Press <kbd className="rounded bg-white/5 px-1.5 py-0.5">Ctrl+N</kbd> to compose your first card.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-[var(--color-ink-dim)]">
          No cards match “{query}”.
        </div>
      ) : (
        <ul className="flex-1 space-y-2 overflow-auto p-3">
          <AnimatePresence initial={false}>
          {filtered.map((card) => {
            const resolved = resolveCardStyle(card);
            const status = getCardStatus(card);
            const priority = getCardPriority(card);
            const statusDef = status ? STATUS_OPTIONS.find((s) => s.value === status) : null;
            const priorityDef = priority ? PRIORITY_OPTIONS.find((p) => p.value === priority) : null;
            return (
              <li
                key={card.id}
                onClick={() => onOpen(card.id)}
                className="group relative cursor-grab overflow-hidden rounded-xl border p-3 pl-4 transition hover:translate-y-[-1px] hover:shadow-lg hover:shadow-black/40 active:cursor-grabbing"
                style={{
                  borderColor: `${resolved.accent}55`,
                  background: `linear-gradient(135deg, ${resolved.accent}1a 0%, rgba(13,13,20,0.6) 70%)`,
                }}
                draggable
                onDragStart={(e) => {
                  setDraggedCardId(card.id);
                  const dt = (e as unknown as React.DragEvent<HTMLLIElement>).dataTransfer;
                  if (!dt) return;
                  dt.setData(CARD_DRAG_MIME, card.id);
                  // Plain-text fallback so other apps can also accept the drop,
                  // and a second custom slot in case some env strips the
                  // primary MIME during dragover (Electron quirk).
                  dt.setData("text/x-chitra-card", card.id);
                  dt.setData("text/plain", card.title);
                  dt.effectAllowed = "copyMove";
                }}
                onDragEnd={() => clearDraggedCardId(card.id)}
              >
                {/* Accent left bar */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-full w-1"
                  style={{ background: resolved.accent }}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-80">
                      <span>{resolved.emoji}</span>
                      <span>{resolved.label}</span>
                      {statusDef && (
                        <span
                          className="ml-1 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: statusDef.color }}
                          title={`Status: ${statusDef.label}`}
                        />
                      )}
                      {card.tags.length > 0 && (
                        <span className="ml-1 truncate opacity-70">· {card.tags.join(", ")}</span>
                      )}
                    </div>
                    <div className="truncate text-sm font-semibold">{card.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs opacity-70">
                      {flattenBody(card)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      {onAddToCanvas && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCanvas(card.id);
                          }}
                          className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] hover:bg-white/10"
                          title="Add to canvas"
                        >
                          + Canvas
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(card.id);
                        }}
                        className="rounded-md px-1 py-0.5 text-xs hover:bg-rose-500/10 hover:text-rose-300"
                        title="Delete card"
                      >
                        ✕
                      </button>
                    </div>
                    {priorityDef && (
                      <div
                        className="flex items-end gap-[2px]"
                        title={`Priority: ${priorityDef.label}`}
                      >
                        {[1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="block w-[2px] rounded-sm"
                            style={{
                              height: 4 + i * 2,
                              background:
                                i <= priorityDef.bars ? priorityDef.color : "rgba(255,255,255,0.18)",
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          </AnimatePresence>
        </ul>
      )}
    </aside>
  );
}

function flattenBody(card: Card): string {
  // Walk the loose RichDoc tree and stitch text nodes.
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(card.body);
  return out.join(" ").slice(0, 160);
}
