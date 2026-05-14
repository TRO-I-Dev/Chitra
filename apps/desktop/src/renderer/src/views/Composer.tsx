import { useEffect, useMemo, useState } from "react";
import { compose, type ClassifierSuggestion } from "@chitra/composer";
import type { CardType } from "@chitra/core";
import { CARD_TYPES, CARD_TYPE_STYLES } from "../cardStyles.js";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; type: CardType; bodyText: string }) => void;
}

export function Composer({ open, onClose, onCreate }: Props): JSX.Element | null {
  const [text, setText] = useState("");
  const [type, setType] = useState<CardType | null>(null);
  const [title, setTitle] = useState("");

  // Recompute suggestions live.
  const draft = useMemo(() => compose(text), [text]);
  const suggestions: ClassifierSuggestion[] = draft.suggestions;

  useEffect(() => {
    if (!open) {
      setText("");
      setType(null);
      setTitle("");
    }
  }, [open]);

  // Adopt heuristic suggestions until the user explicitly picks something.
  useEffect(() => {
    setTitle((t) => (t.length === 0 ? draft.title : t));
  }, [draft.title]);
  useEffect(() => {
    if (type === null && suggestions[0]) setType(suggestions[0].type);
  }, [suggestions, type]);

  if (!open) return null;

  const submit = () => {
    if (!text.trim()) return;
    onCreate({
      title: title.trim() || draft.title,
      type: type ?? suggestions[0]?.type ?? "note",
      bodyText: text,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-24 w-[min(720px,92vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            Compose card
          </div>
          <kbd className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)]">
            Esc
          </kbd>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (auto-extracted)"
          className="w-full bg-transparent px-5 pt-4 text-lg font-semibold tracking-tight outline-none placeholder:text-[var(--color-ink-dim)]/60"
        />

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
          rows={8}
          placeholder="Paste or type the writing for this card. Try keywords like 'risk', 'KPI', 'persona', or start with a heading…"
          className="block w-full resize-none bg-transparent px-5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-dim)]/60"
        />

        {/* Type chips */}
        <div className="border-t border-white/5 px-5 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Type
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CARD_TYPES.map((t) => {
              const style = CARD_TYPE_STYLES[t];
              const suggested = suggestions.find((s) => s.type === t);
              const active = (type ?? suggestions[0]?.type) === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={[
                    "group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                    active
                      ? `bg-gradient-to-br ${style.tone}`
                      : "border-white/5 bg-white/[0.02] text-[var(--color-ink-dim)] hover:bg-white/[0.05]",
                  ].join(" ")}
                  title={suggested ? `${style.label} · ${suggested.reason}` : style.label}
                >
                  <span>{style.emoji}</span>
                  <span>{style.label}</span>
                  {suggested && (
                    <span className="ml-1 rounded-full bg-black/30 px-1.5 py-px text-[10px] tabular-nums opacity-80">
                      {Math.round(suggested.confidence * 100)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 bg-black/30 px-5 py-3">
          <div className="text-xs text-[var(--color-ink-dim)]">
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">Ctrl</kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">Enter</kbd>
            <span className="ml-2">to add</span>
          </div>
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
              onClick={submit}
              disabled={!text.trim()}
              className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-1.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
