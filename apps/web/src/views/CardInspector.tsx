import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, CardStyle, CardType, RichDoc } from "@chitra/core";
import {
  CARD_TYPES,
  CARD_TYPE_STYLES,
  ACCENT_PALETTE,
  ICON_CHOICES,
  RADIUS_PRESETS,
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

interface CardComment {
  id: string;
  text: string;
  createdAt: string;
}

function nanoComment(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CardInspector({
  card,
  onClose,
  collapsed = false,
}: {
  card: Card | null;
  onClose: () => void;
  /** When true, the panel hides itself even if a card is open. */
  collapsed?: boolean;
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
  const [style, setStyle] = useState<CardStyle | null>(null);
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [priority, setPriority] = useState<CardPriority | null>(null);
  const [newComment, setNewComment] = useState("");

  const comments: CardComment[] = (() => {
    const raw = (card?.metadata as Record<string, unknown> | undefined)?.["comments"];
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is CardComment =>
      c != null && typeof c === "object"
      && typeof (c as CardComment).id === "string"
      && typeof (c as CardComment).text === "string"
      && typeof (c as CardComment).createdAt === "string",
    );
  })();

  const addComment = (): void => {
    if (!card) return;
    const text = newComment.trim();
    if (!text) return;
    const next: CardComment[] = [
      ...comments,
      { id: nanoComment(), text, createdAt: new Date().toISOString() },
    ];
    const meta = { ...((card.metadata as Record<string, unknown>) ?? {}), comments: next };
    updateCard(card.id, { metadata: meta });
    setNewComment("");
  };

  const deleteComment = (id: string): void => {
    if (!card) return;
    const next = comments.filter((c) => c.id !== id);
    const meta = { ...((card.metadata as Record<string, unknown>) ?? {}), comments: next };
    updateCard(card.id, { metadata: meta });
  };

  const images: string[] = (() => {
    const raw = (card?.metadata as Record<string, unknown> | undefined)?.["images"];
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === "string");
  })();

  const attachImage = async (file: File): Promise<void> => {
    if (!card) return;
    if (file.size > 2_000_000) {
      alert("Image is larger than 2 MB. Please resize before attaching.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const next = [...images, dataUrl];
    const meta = { ...((card.metadata as Record<string, unknown>) ?? {}), images: next };
    updateCard(card.id, { metadata: meta });
  };

  const removeImage = (idx: number): void => {
    if (!card) return;
    const next = images.filter((_, i) => i !== idx);
    const meta = { ...((card.metadata as Record<string, unknown>) ?? {}), images: next };
    updateCard(card.id, { metadata: meta });
  };

  useEffect(() => {
    if (!card) return;
    skipLiveUpdate.current = true;
    setTitle(card.title);
    setBody(bodyToText(card.body));
    setType(card.type);
    setTags(card.tags.join(", "));
    setAccent(card.color ?? null);
    setIcon(card.icon ?? null);
    setStyle(card.style ?? null);
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
      // `null` clears the override; an empty object would still trigger
      // schema validation but produce no visual change.
      style: style && Object.keys(style).length > 0 ? style : null,
    };
  };

  const dirty = card ?
    title !== card.title ||
    type !== card.type ||
    bodyText !== bodyToText(card.body) ||
    tags !== card.tags.join(", ") ||
    accent !== (card.color ?? null) ||
    icon !== (card.icon ?? null) ||
    JSON.stringify(style ?? {}) !== JSON.stringify(card.style ?? {}) ||
    status !== getCardStatus(card) ||
    priority !== getCardPriority(card)
    : false;

  // Latest patch + the card it applies to, kept in a ref so the close-commit
  // effect (which fires when `card?.id` transitions) can flush the pending
  // edit synchronously — even if the 120 ms debounce never fired.
  const pendingPatchRef = useRef<{ cardId: string; patch: ReturnType<typeof buildPatch> } | null>(null);
  if (card && dirty) {
    pendingPatchRef.current = { cardId: card.id, patch: buildPatch(card) };
  }

  const save = (): void => {
    if (!card) return;
    updateCard(card.id, buildPatch(card));
    pendingPatchRef.current = null;
    onClose();
  };

  useEffect(() => {
    if (!card) return;
    if (skipLiveUpdate.current) {
      skipLiveUpdate.current = false;
      return;
    }
    if (!dirty) return;
    const id = window.setTimeout(() => {
      updateCardLive(card.id, buildPatch(card));
      pendingPatchRef.current = null;
    }, 120);
    return () => window.clearTimeout(id);
    // `buildPatch` intentionally reads the current local form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, dirty, title, bodyText, type, tags, accent, icon, style, status, priority, updateCardLive]);

  // Commit any pending (debounced) edit when the inspector closes or switches
  // to a different card — prevents losing colour/icon/status changes when the
  // user dismisses the panel within the debounce window.
  useEffect(() => {
    return () => {
      const pending = pendingPatchRef.current;
      if (pending) {
        updateCardLive(pending.cardId, pending.patch);
        pendingPatchRef.current = null;
      }
    };
  }, [card?.id, updateCardLive]);

  if (!card || collapsed) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key="inspector"
        role="complementary"
        aria-label="Card inspector"
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="fixed right-2 top-14 bottom-8 z-30 flex w-[min(420px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl shadow-black/60"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            Edit card
          </div>
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)]">
              ]
            </kbd>
            <button
              type="button"
              onClick={onClose}
              title="Close inspector (Esc)"
              className="rounded-md px-1.5 py-0.5 text-[var(--color-ink-dim)] hover:bg-white/10 hover:text-[var(--color-ink)]"
              aria-label="Close inspector"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent px-5 pt-4 text-lg font-semibold tracking-tight outline-none placeholder:text-[var(--color-ink-dim)]/60"
            placeholder="Card title"
          />

          <textarea
            value={bodyText}
            onChange={(e) => setBody(e.target.value)}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.kind === "file" && item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) { e.preventDefault(); void attachImage(file); }
                  return;
                }
              }
            }}
            onDrop={(e) => {
              const file = e.dataTransfer?.files?.[0];
              if (file && file.type.startsWith("image/")) {
                e.preventDefault();
                void attachImage(file);
              }
            }}
            rows={9}
            placeholder="Body… (paste or drop images)"
            className="block w-full resize-none bg-transparent px-5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-dim)]/60"
          />

          {images.length > 0 && (
            <div className="px-5 pb-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                Images ({images.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <div key={i} className="group relative">
                    <img
                      src={src}
                      alt=""
                      className="h-16 w-16 rounded-md border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white group-hover:flex"
                      aria-label="Remove image"
                      title="Remove image"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Card style — surface, border, radius, shadow overrides. */}
          <StyleSection style={style} onChange={setStyle} />

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

          <div className="px-5 pb-4">
            <label className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
              Notes ({comments.length})
            </label>
            <div className="mb-2 space-y-1.5">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-start gap-2 rounded-md border border-white/5 bg-black/30 px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                >
                  <div className="flex-1">
                    <div className="whitespace-pre-wrap">{c.text}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                      {new Date(c.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteComment(c.id)}
                    className="rounded p-0.5 text-[var(--color-ink-dim)] opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label="Delete note"
                    title="Delete note"
                  >×</button>
                </div>
              ))}
              {comments.length === 0 && (
                <div className="text-[11px] italic text-[var(--color-ink-dim)]">No notes yet.</div>
              )}
            </div>
            <div className="flex gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    addComment();
                  }
                }}
                placeholder="Add a note… (Ctrl+Enter)"
                rows={2}
                className="flex-1 resize-none rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs outline-none placeholder:text-[var(--color-ink-dim)]/60 focus:border-[var(--color-accent)]/60"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!newComment.trim()}
                className="self-end rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >Add</button>
            </div>
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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ *
 *  Style section — per-card surface, border, radius, shadow.         *
 * ------------------------------------------------------------------ */

const BORDER_STYLES: Array<{ value: NonNullable<CardStyle["border"]>; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "none", label: "None" },
];

const SHADOW_OPTIONS: Array<{ value: NonNullable<CardStyle["shadow"]>; label: string }> = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "lift", label: "Lift" },
  { value: "pop", label: "Pop" },
];

function StyleSection({
  style,
  onChange,
}: {
  style: CardStyle | null;
  onChange: (next: CardStyle | null) => void;
}): JSX.Element {
  const isCustom = !!style && Object.keys(style).length > 0;

  // Patch helper: merges + drops undefined/empty values so the persisted
  // object stays minimal (and JSON-diff-friendly for the dirty check).
  const patch = (next: Partial<CardStyle>): void => {
    const merged: CardStyle = { ...(style ?? {}), ...next };
    for (const k of Object.keys(merged) as Array<keyof CardStyle>) {
      const v = merged[k];
      if (v === undefined || v === null || v === "") delete merged[k];
    }
    onChange(Object.keys(merged).length > 0 ? merged : null);
  };

  return (
    <div className="border-t border-white/5 px-5 py-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
        <span>Card style</span>
        {isCustom && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded px-2 py-0.5 text-[10px] hover:bg-white/5"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ColorInput
          label="Surface"
          value={style?.bg ?? ""}
          onChange={(v) => patch({ bg: v || undefined })}
        />
        <ColorInput
          label="Border"
          value={style?.stroke ?? ""}
          onChange={(v) => patch({ stroke: v || undefined })}
        />
        <ColorInput
          label="Text"
          value={style?.text ?? ""}
          onChange={(v) => patch({ text: v || undefined })}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
            Corner radius
          </div>
          <div className="flex flex-wrap gap-1">
            {RADIUS_PRESETS.map((r) => {
              const active = (style?.radius ?? 16) === r;
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => patch({ radius: r })}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px] transition",
                    active
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]",
                  ].join(" ")}
                  style={{ borderRadius: r }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
            Shadow
          </div>
          <div className="flex flex-wrap gap-1">
            {SHADOW_OPTIONS.map((s) => {
              const active = (style?.shadow ?? "lift") === s.value;
              return (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => patch({ shadow: s.value })}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px] transition",
                    active
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
            Border style
          </div>
          <div className="flex flex-wrap gap-1">
            {BORDER_STYLES.map((b) => {
              const active = (style?.border ?? "solid") === b.value;
              return (
                <button
                  type="button"
                  key={b.value}
                  onClick={() => patch({ border: b.value })}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px] transition",
                    active
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
            Border width
          </div>
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={style?.borderWidth ?? 1}
            onChange={(e) => patch({ borderWidth: Number(e.target.value) })}
            className="h-1 w-full cursor-pointer accent-[var(--color-accent-2)]"
          />
          <div className="text-right text-[10px] text-[var(--color-ink-dim)]">
            {(style?.borderWidth ?? 1).toFixed(1)} px
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}): JSX.Element {
  // The native colour input doesn't accept rgba/empty strings, so we
  // keep a separate text field for free-form CSS colours and only
  // mirror to the swatch when the value parses as #rrggbb.
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#202028";
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]/80">
        {label}
      </span>
      <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-1.5 py-1">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={`${label} colour`}
        />
        <input
          type="text"
          value={value}
          placeholder="auto"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[11px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-dim)]/40"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Clear"
            className="text-[10px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
          >
            ×
          </button>
        )}
      </div>
    </label>
  );
}
