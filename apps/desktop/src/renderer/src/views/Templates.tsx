import { AnimatePresence, motion } from "framer-motion";
import { TEMPLATES, type Template, type TemplateCategory } from "@chitra/templates";
import { useProjectStore } from "../state/projectStore.js";

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  strategy: "Strategy",
  architecture: "Architecture",
  research: "Research",
  planning: "Planning",
  discovery: "Discovery",
};

export function Templates({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const applyTemplate = useProjectStore((s) => s.applyTemplate);

  const grouped = TEMPLATES.reduce<Record<TemplateCategory, Template[]>>(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {} as Record<TemplateCategory, Template[]>,
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="relative w-[min(960px,92vw)] max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d14] p-6 shadow-2xl"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="mb-5 flex items-baseline justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Templates</h2>
                <p className="text-xs text-[var(--color-ink-dim)]">
                  Stamp a fresh board from a curated recipe.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2.5 py-1 text-xs text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]"
              >
                Close
              </button>
            </header>

            <div className="space-y-6">
              {(Object.keys(grouped) as TemplateCategory[]).map((cat) => (
                <section key={cat}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-dim)]">
                    {CATEGORY_LABEL[cat]}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {grouped[cat].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          applyTemplate(t);
                          onClose();
                        }}
                        className="group flex h-full flex-col gap-2 rounded-xl border border-white/10 bg-[#11111a] p-4 text-left transition hover:border-[var(--color-accent)]/60 hover:bg-[#15151f]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-sm text-black">
                            {t.icon}
                          </span>
                          <span className="font-medium text-[var(--color-ink)]">{t.name}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--color-ink-dim)]">
                          {t.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
