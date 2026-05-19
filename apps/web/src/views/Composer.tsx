import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { compose, type ClassifierSuggestion } from "@chitra/composer";
import type { CardType } from "@chitra/core";
import { CARD_TYPES, CARD_TYPE_STYLES } from "../cardStyles.js";
import { aiCompose, type AiComposeResult } from "../composer/aiCompose.js";
import { composeMarkdown, looksLikeMarkdown } from "../composer/composeMarkdown.js";
import { hasAnyProvider } from "../platform/ai/index.js";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; type: CardType; bodyText: string }) => void;
  /** Called when the user accepts an AI multi-card split. The caller
   *  receives the full result (cards + suggested edges) so it can wire
   *  edges across the resulting card IDs. */
  onBulkCreate?: (result: AiComposeResult) => void;
}

export function Composer({ open, onClose, onCreate, onBulkCreate }: Props): JSX.Element | null {
  const [text, setText] = useState("");
  const [type, setType] = useState<CardType | null>(null);
  const [title, setTitle] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);

  // Recompute suggestions live.
  const draft = useMemo(() => compose(text), [text]);
  const suggestions: ClassifierSuggestion[] = draft.suggestions;

  useEffect(() => {
    if (!open) {
      setText("");
      setType(null);
      setTitle("");
      setAiError(null);
      return;
    }
    void hasAnyProvider().then(setAiAvailable);
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

  const runAiSplit = async (): Promise<void> => {
    if (!text.trim() || !onBulkCreate) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await aiCompose(text);
      if (!result || result.cards.length === 0) {
        setAiError("AI returned no cards. Add an API key in Settings or refine your text.");
        return;
      }
      onBulkCreate(result);
      onClose();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const runMarkdownSplit = (): void => {
    if (!text.trim() || !onBulkCreate) return;
    const result = composeMarkdown(text);
    if (result.cards.length === 0) return;
    onBulkCreate(result);
    onClose();
  };

  const mdAvailable = onBulkCreate && looksLikeMarkdown(text);

  return (
    <AnimatePresence>
      <motion.div
        key="composer"
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
            {aiError && (
              <span className="ml-3 text-red-400">{aiError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mdAvailable && (
              <button
                type="button"
                onClick={runMarkdownSplit}
                title="Split this markdown into one card per heading (no AI needed)."
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[var(--color-ink-dim)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
              >
                # Split by headings
              </button>
            )}
            {aiAvailable && onBulkCreate && (
              <button
                type="button"
                onClick={() => void runAiSplit()}
                disabled={!text.trim() || aiBusy}
                title="Use the configured AI provider to split this writing into multiple typed cards with suggested edges."
                className="rounded-lg border border-[var(--color-accent-2)]/40 px-3 py-1.5 text-sm text-[var(--color-accent-2)] transition hover:bg-[var(--color-accent-2)]/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {aiBusy ? "Splitting…" : "✨ AI: split into cards"}
              </button>
            )}
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
      </motion.div>
    </motion.div>
    </AnimatePresence>
  );
}
