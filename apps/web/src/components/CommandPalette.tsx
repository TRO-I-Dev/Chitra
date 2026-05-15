/**
 * Cmd/Ctrl+K command palette. Lists every command from the central
 * registry, grouped, with fuzzy search via cmdk. Selecting an item
 * dispatches the command through the platform bus.
 */
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { COMMANDS } from "../platform/menu.js";
import { platform } from "../platform/index.js";

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const groups = Array.from(new Set(COMMANDS.map((c) => c.group)));

  function run(id: string): void {
    onClose();
    // Defer so close-side effects don't conflict.
    requestAnimationFrame(() => platform.dispatchCommand(id));
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[18vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="w-[min(560px,92vw)] rounded-2xl border border-white/10 bg-[#0d0d14] shadow-2xl"
            initial={{ scale: 0.96, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" className="overflow-hidden rounded-2xl">
              <Command.Input
                autoFocus
                placeholder="Type a command…"
                className="w-full border-b border-white/5 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--color-ink-dim)]/60"
              />
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-6 text-center text-sm text-[var(--color-ink-dim)]">
                  No matching commands.
                </Command.Empty>
                {groups.map((g) => (
                  <Command.Group
                    key={g}
                    heading={g}
                    className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--color-ink-dim)]"
                  >
                    {COMMANDS.filter((c) => c.group === g).map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`${c.label} ${c.id}`}
                        onSelect={() => run(c.id)}
                        className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--color-ink-dim)] aria-selected:bg-white/[0.06] aria-selected:text-[var(--color-ink)]"
                      >
                        <span>{c.label}</span>
                        {c.hint && (
                          <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] tracking-wide text-[var(--color-ink-dim)]">
                            {c.hint}
                          </kbd>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
