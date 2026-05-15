/**
 * Modal passphrase prompt — wired into the secrets layer at app boot.
 * `promptPassphrase()` resolves with the entered string, or null if
 * cancelled. Multiple concurrent prompts queue.
 */
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";

interface Pending {
  resolve: (v: string | null) => void;
}

let pending: Pending | null = null;
let setOpen: ((open: boolean) => void) | null = null;
let mounted = false;

export function promptPassphrase(): Promise<string | null> {
  ensureMounted();
  return new Promise((resolve) => {
    if (pending) {
      // Coalesce: only one prompt at a time. New caller waits for the same answer.
      const prev = pending.resolve;
      pending.resolve = (v) => {
        prev(v);
        resolve(v);
      };
      return;
    }
    pending = { resolve };
    setOpen?.(true);
  });
}

function ensureMounted(): void {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const host = document.createElement("div");
  host.id = "chitra-passphrase-host";
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  root.render(<PassphraseHost />);
}

function PassphraseHost(): JSX.Element {
  const [open, _setOpen] = useState(false);
  useEffect(() => {
    setOpen = _setOpen;
    return () => {
      setOpen = null;
    };
  }, []);
  return <PassphraseModal open={open} onResolve={(v) => {
    const p = pending;
    pending = null;
    _setOpen(false);
    p?.resolve(v);
  }} />;
}

function PassphraseModal({
  open,
  onResolve,
}: {
  open: boolean;
  onResolve: (v: string | null) => void;
}): JSX.Element {
  const [pass, setPass] = useState("");
  useEffect(() => {
    if (!open) setPass("");
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => onResolve(null)}
        >
          <motion.form
            className="relative w-[min(420px,92vw)] rounded-2xl border border-white/10 bg-[#0d0d14] p-5 shadow-2xl"
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (pass) onResolve(pass);
            }}
          >
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Unlock secrets
            </h3>
            <p className="mb-4 text-xs text-[var(--color-ink-dim)]">
              Tokens are encrypted with this passphrase and stored locally in this
              browser. If you forget it, stored tokens cannot be recovered.
            </p>
            <input
              autoFocus
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Passphrase"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/60"
              aria-label="Passphrase"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onResolve(null)}
                className="rounded-md px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pass}
                className="rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
              >
                Unlock
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
