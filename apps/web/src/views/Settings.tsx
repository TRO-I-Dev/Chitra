import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { platform } from "../platform/index.js";

type SecretKey =
  | "notion-token"
  | "confluence-token"
  | "ai-openai-key"
  | "ai-anthropic-key"
  | "ai-ollama-url";

type Form = {
  notionParentPageId: string;
  notionToken: string;
  confluenceBaseUrl: string;
  confluenceEmail: string;
  confluenceSpaceKey: string;
  confluenceToken: string;
  openaiKey: string;
  anthropicKey: string;
  ollamaUrl: string;
};

const EMPTY: Form = {
  notionParentPageId: "",
  notionToken: "",
  confluenceBaseUrl: "",
  confluenceEmail: "",
  confluenceSpaceKey: "",
  confluenceToken: "",
  openaiKey: "",
  anthropicKey: "",
  ollamaUrl: "",
};

export function Settings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [settings, notionToken, confluenceToken, openaiKey, anthropicKey, ollamaUrl] = await Promise.all([
          platform.settingsGet(),
          platform.secretGet({ key: "notion-token" }),
          platform.secretGet({ key: "confluence-token" }),
          platform.secretGet({ key: "ai-openai-key" }),
          platform.secretGet({ key: "ai-anthropic-key" }),
          platform.secretGet({ key: "ai-ollama-url" }),
        ]);
        if (cancelled) return;
        setForm({
          notionParentPageId: settings.notionParentPageId ?? "",
          notionToken: notionToken.value ?? "",
          confluenceBaseUrl: settings.confluenceBaseUrl ?? "",
          confluenceEmail: settings.confluenceEmail ?? "",
          confluenceSpaceKey: settings.confluenceSpaceKey ?? "",
          confluenceToken: confluenceToken.value ?? "",
          openaiKey: openaiKey.value ?? "",
          anthropicKey: anthropicKey.value ?? "",
          ollamaUrl: ollamaUrl.value ?? "",
        });
        setLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await platform.settingsSet({
        notionParentPageId: form.notionParentPageId.trim() || undefined,
        confluenceBaseUrl: form.confluenceBaseUrl.trim() || undefined,
        confluenceEmail: form.confluenceEmail.trim() || undefined,
        confluenceSpaceKey: form.confluenceSpaceKey.trim() || undefined,
      });
      const setOrClear = async (key: SecretKey, value: string): Promise<void> => {
        if (value.trim()) await platform.secretSet({ key, value: value.trim() });
        else await platform.secretDelete({ key });
      };
      await setOrClear("notion-token", form.notionToken);
      await setOrClear("confluence-token", form.confluenceToken);
      await setOrClear("ai-openai-key", form.openaiKey);
      await setOrClear("ai-anthropic-key", form.anthropicKey);
      await setOrClear("ai-ollama-url", form.ollamaUrl);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

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
            className="relative w-[min(720px,92vw)] max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d14] p-6 shadow-2xl"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="mb-5 flex items-baseline justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Publishing settings</h2>
                <p className="text-xs text-[var(--color-ink-dim)]">
                  Tokens are encrypted with your passphrase and stored locally in this browser. They never leave your device.
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

            {!loaded ? (
              <div className="py-12 text-center text-sm text-[var(--color-ink-dim)]">Loading…</div>
            ) : (
              <div className="space-y-6">
                <Section title="Notion" hint="Create an internal integration at notion.so/my-integrations and share the parent page with it.">
                  <Field
                    label="Integration token"
                    value={form.notionToken}
                    onChange={(v) => setForm({ ...form, notionToken: v })}
                    placeholder="secret_..."
                    type="password"
                  />
                  <Field
                    label="Parent page id (32-char hex)"
                    value={form.notionParentPageId}
                    onChange={(v) => setForm({ ...form, notionParentPageId: v })}
                    placeholder="abc123…"
                  />
                </Section>

                <Section title="Confluence Cloud" hint="API token from id.atlassian.com → Account Settings → Security → API tokens.">
                  <Field
                    label="Site base URL"
                    value={form.confluenceBaseUrl}
                    onChange={(v) => setForm({ ...form, confluenceBaseUrl: v })}
                    placeholder="https://acme.atlassian.net"
                  />
                  <Field
                    label="Account email"
                    value={form.confluenceEmail}
                    onChange={(v) => setForm({ ...form, confluenceEmail: v })}
                    placeholder="you@company.com"
                  />
                  <Field
                    label="Space key"
                    value={form.confluenceSpaceKey}
                    onChange={(v) => setForm({ ...form, confluenceSpaceKey: v })}
                    placeholder="ENG"
                  />
                  <Field
                    label="API token"
                    value={form.confluenceToken}
                    onChange={(v) => setForm({ ...form, confluenceToken: v })}
                    placeholder="token"
                    type="password"
                  />
                </Section>

                <Section title="AI Composer (BYO key)" hint="Used by the Composer LLM mode and 'Explain my diagram'. Add any one provider. OpenAI is the recommended default.">
                  <Field
                    label="OpenAI API key"
                    value={form.openaiKey}
                    onChange={(v) => setForm({ ...form, openaiKey: v })}
                    placeholder="sk-..."
                    type="password"
                  />
                  <Field
                    label="Anthropic API key"
                    value={form.anthropicKey}
                    onChange={(v) => setForm({ ...form, anthropicKey: v })}
                    placeholder="sk-ant-..."
                    type="password"
                  />
                  <Field
                    label="Ollama base URL (local)"
                    value={form.ollamaUrl}
                    onChange={(v) => setForm({ ...form, ollamaUrl: v })}
                    placeholder="http://localhost:11434"
                  />
                </Section>

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                    {error}
                  </div>
                )}

                <footer className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-ink-dim)]">
                    {savedAt ? `Saved at ${savedAt}` : "\u00a0"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] px-4 py-1.5 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </footer>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-xl border border-white/5 bg-[#11111a] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mb-3 text-[11px] text-[var(--color-ink-dim)]">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}): JSX.Element {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[var(--color-ink-dim)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/10 bg-[#0a0a10] px-3 py-2 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]/50"
      />
    </label>
  );
}
