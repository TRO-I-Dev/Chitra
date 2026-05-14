import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, CardType, RichDoc } from "@chitra/core";
import { CARD_TYPES, CARD_TYPE_STYLES } from "../cardStyles.js";
import { useProjectStore } from "../state/projectStore.js";

function bodyToText(body: RichDoc): string {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(body);
  return out.join(" ");
}

function textToBody(text: string): RichDoc {
  const trimmed = text.trim();
  if (!trimmed) return { type: "doc", content: [{ type: "paragraph" }] };
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  }));
  return { type: "doc", content: paragraphs };
}

export function CardInspector({
  card,
  onClose,
}: {
  card: Card | null;
  onClose: () => void;
}): JSX.Element {
  const updateCard = useProjectStore((s) => s.updateCard);
  const removeCard = useProjectStore((s) => s.removeCard);
  const [title, setTitle] = useState("");
  const [bodyText, setBody] = useState("");
  const [type, setType] = useState<CardType>("note");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setBody(bodyToText(card.body));
    setType(card.type);
    setTags(card.tags.join(", "));
  }, [card]);

  if (!card) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

  const save = (): void => {
    updateCard(card.id, {
      title: title.trim() || "Untitled",
      type,
      body: textToBody(bodyText),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    onClose();
  };

  const dirty =
    title !== card.title ||
    type !== card.type ||
    bodyText !== bodyToText(card.body) ||
    tags !== card.tags.join(", ");

  return (
    <AnimatePresence>
      <motion.div
        key="inspector"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 12, scale: 0.98, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="mt-20 w-[min(720px,92vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl shadow-black/60"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          }}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
              Edit card
            </div>
            <kbd className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)]">
              Esc
            </kbd>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent px-5 pt-4 text-lg font-semibold tracking-tight outline-none placeholder:text-[var(--color-ink-dim)]/60"
            placeholder="Card title"
          />

          <textarea
            value={bodyText}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder="Body…"
            className="block w-full resize-none bg-transparent px-5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-dim)]/60"
          />

          <div className="border-t border-white/5 px-5 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              Type
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_TYPES.map((t) => {
                const style = CARD_TYPE_STYLES[t];
                const active = t === type;
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setType(t)}
                    className={[
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                      active
                        ? `bg-gradient-to-br ${style.tone}`
                        : "border-white/5 bg-white/[0.02] text-[var(--color-ink-dim)] hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <span>{style.emoji}</span>
                    <span>{style.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/5 px-5 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              Tags (comma separated)
            </div>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="strategy, q3, draft"
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm outline-none placeholder:text-[var(--color-ink-dim)]/60 focus:border-[var(--color-accent)]/60"
            />
          </div>

          <div className="flex items-center justify-between border-t border-white/5 bg-black/30 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this card?")) {
                  removeCard(card.id);
                  onClose();
                }
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
            >
              Delete
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty}
                className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-1.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
