import type { Card } from "@chitra/core";
import { CARD_TYPE_STYLES } from "../cardStyles.js";
import { CARD_DRAG_MIME } from "../canvas/Canvas.js";

interface Props {
  cards: Card[];
  onAddClick: () => void;
  onDelete: (id: string) => void;
}

export function Inbox({ cards, onAddClick, onDelete }: Props): JSX.Element {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-white/5 bg-[#0d0d14]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            Inbox
          </div>
          <div className="text-sm font-semibold">{cards.length} cards</div>
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

      {cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--color-ink-dim)]">
          <div className="mb-2 text-3xl">✎</div>
          <p>Press <kbd className="rounded bg-white/5 px-1.5 py-0.5">Ctrl+N</kbd> to compose your first card.</p>
        </div>
      ) : (
        <ul className="flex-1 space-y-2 overflow-auto p-3">
          {cards.map((card) => {
            const style = CARD_TYPE_STYLES[card.type];
            return (
              <li
                key={card.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(CARD_DRAG_MIME, card.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={[
                  "group cursor-grab rounded-xl border bg-gradient-to-br p-3 transition hover:translate-y-[-1px] hover:shadow-lg hover:shadow-black/40 active:cursor-grabbing",
                  style.tone,
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-80">
                      <span>{style.emoji}</span>
                      <span>{style.label}</span>
                    </div>
                    <div className="truncate text-sm font-semibold">{card.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs opacity-70">
                      {flattenBody(card)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(card.id)}
                    className="opacity-0 transition group-hover:opacity-60 hover:opacity-100"
                    title="Delete card"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
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
