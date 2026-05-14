import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, CardType, RichDoc } from "@chitra/core";
import {
  CARD_TYPES,
  CARD_TYPE_STYLES,
  ACCENT_PALETTE,
  ICON_CHOICES,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  getCardStatus,
  getCardPriority,
  type CardStatus,
  type CardPriority,
} from "../cardStyles.js";
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
  const updateCardLive = useProjectStore((s) => s.updateCardLive);
  const removeCard = useProjectStore((s) => s.removeCard);
  const skipLiveUpdate = useRef(false);
  const [title, setTitle] = useState("");
  const [bodyText, setBody] = useState("");
  const [type, setType] = useState<CardType>("note");
  const [tags, setTags] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [priority, setPriority] = useState<CardPriority | null>(null);

  useEffect(() => {
    if (!card) return;
    skipLiveUpdate.current = true;
    setTitle(card.title);
    setBody(bodyToText(card.body));
    setType(card.type);
    setTags(card.tags.join(", "));
    setAccent(card.color ?? null);
    setIcon(card.icon ?? null);
    setStatus(getCardStatus(card));
    setPriority(getCardPriority(card));
  }, [card?.id]);

  const buildPatch = (baseCard: Card): Parameters<typeof updateCard>[1] => {
    const meta: Record<string, unknown> = {
      ...((baseCard.metadata as Record<string, unknown>) ?? {}),
    };
    if (status) meta["status"] = status; else delete meta["status"];
    if (priority) meta["priority"] = priority; else delete meta["priority"];
    return {
      title: title.trim() || "Untitled",
      type,
      body: textToBody(bodyText),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      metadata: meta,
      color: accent ?? null,
      icon: icon ?? null,
    };
  };

  const save = (): void => {
    if (!card) return;
    updateCard(card.id, buildPatch(card));
    onClose();
  };

  const dirty = card ?
    title !== card.title ||
    type !== card.type ||
    bodyText !== bodyToText(card.body) ||
    tags !== card.tags.join(", ") ||
    accent !== (card.color ?? null) ||
    icon !== (card.icon ?? null) ||
    status !== getCardStatus(card) ||
    priority !== getCardPriority(card)
    : false;

  useEffect(() => {
    if (!card) return;
    if (skipLiveUpdate.current) {
      skipLiveUpdate.current = false;
      return;
    }
    if (!dirty) return;
    const id = window.setTimeout(() => updateCardLive(card.id, buildPatch(card)), 120);
    return () => window.clearTimeout(id);
    // `buildPatch` intentionally reads the current local form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, dirty, title, bodyText, type, tags, accent, icon, status, priority, updateCardLive]);

  if (!card) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

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

          {/* Accent override */}
          <div className="border-t border-white/5 px-5 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              <span>Accent colour</span>
              {accent && (
                <button
                  type="button"
                  onClick={() => setAccent(null)}
                  className="rounded px-2 py-0.5 text-[10px] hover:bg-white/5"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PALETTE.map((sw) => {
                const active = accent === sw.color;
                return (
                  <button
                    type="button"
                    key={sw.id}
                    onClick={() => setAccent(sw.color)}
                    title={sw.label}
                    className={[
                      "h-7 w-7 rounded-full border transition",
                      active
                        ? "scale-110 border-white/50 ring-2 ring-white/30"
                        : "border-white/10 hover:border-white/30",
                    ].join(" ")}
                    style={{ background: sw.color }}
                  />
                );
              })}
            </div>
          </div>

          {/* Icon override */}
          <div className="border-t border-white/5 px-5 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              <span>Icon</span>
              {icon && (
                <button
                  type="button"
                  onClick={() => setIcon(null)}
                  className="rounded px-2 py-0.5 text-[10px] hover:bg-white/5"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.map((g) => {
                const active = icon === g;
                return (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setIcon(g)}
                    className={[
                      "h-8 w-8 rounded-lg border text-base transition",
                      active
                        ? "border-[var(--color-accent-2)]/60 bg-white/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]",
                    ].join(" ")}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status & priority */}
          <div className="grid grid-cols-2 gap-x-4 border-t border-white/5 px-5 py-3">
            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                <span>Status</span>
                {status && (
                  <button
                    type="button"
                    onClick={() => setStatus(null)}
                    className="rounded px-2 py-0.5 text-[10px] hover:bg-white/5"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={[
                        "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition",
                        active
                          ? "border-white/30 bg-white/10"
                          : "border-white/5 bg-white/[0.02] text-[var(--color-ink-dim)] hover:bg-white/[0.05]",
                      ].join(" ")}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: opt.color }}
                      />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                <span>Priority</span>
                {priority && (
                  <button
                    type="button"
                    onClick={() => setPriority(null)}
                    className="rounded px-2 py-0.5 text-[10px] hover:bg-white/5"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {PRIORITY_OPTIONS.map((opt) => {
                  const active = priority === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setPriority(opt.value)}
                      className={[
                        "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition",
                        active
                          ? "border-white/30 bg-white/10"
                          : "border-white/5 bg-white/[0.02] text-[var(--color-ink-dim)] hover:bg-white/[0.05]",
                      ].join(" ")}
                    >
                      <span className="flex items-end gap-[2px]">
                        {[1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="block w-[2px] rounded-sm"
                            style={{
                              height: 4 + i * 2,
                              background:
                                i <= opt.bars ? opt.color : "rgba(255,255,255,0.18)",
                            }}
                          />
                        ))}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
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
