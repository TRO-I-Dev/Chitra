import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { useProjectStore } from "./state/projectStore.js";
import { Welcome } from "./views/Welcome.js";
import { Workspace } from "./views/Workspace.js";
import { Onboarding } from "./views/Onboarding.js";
import { buildSampleProject } from "./samples/sampleProject.js";
import { platform } from "./platform/index.js";
import { setPassphraseProvider } from "./platform/secrets.js";
import { promptPassphrase } from "./components/PassphrasePrompt.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { useGlobalHotkeys } from "./hooks/useHotkeys.js";

export function App(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const dirty = useProjectStore((s) => s.dirty);
  const setProject = useProjectStore((s) => s.setProject);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Wire the secrets layer to a UI-driven passphrase prompt.
  useEffect(() => {
    setPassphraseProvider(promptPassphrase);
    return () => setPassphraseProvider(null);
  }, []);

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // App-level commands that work regardless of whether a project is open.
  useEffect(() => {
    const off = platform.onMenu(async (action) => {
      try {
        if (action === "new-project") {
          const p = await platform.projectNew({ name: "Untitled project" });
          setProject(p, null, null);
        } else if (action === "open-project") {
          const res = await platform.projectOpen();
          if (res) setProject(res.project, res.path, res.handleId);
        } else if (action === "open-palette") {
          setPaletteOpen(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toast.error(msg);
      }
    });
    return off;
  }, [setProject]);

  useGlobalHotkeys({ onPalette: () => setPaletteOpen(true) });

  async function handleCreate(name: string): Promise<void> {
    setError(null);
    try {
      const p = await platform.projectNew({ name });
      setProject(p, null, null);
      toast.success(`Created \u201c${p.name}\u201d`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleOpen(handleId?: string | null): Promise<void> {
    setError(null);
    try {
      const res = handleId
        ? await platform.projectOpenRecent(handleId)
        : await platform.projectOpen();
      if (res) {
        setProject(res.project, res.path, res.handleId);
        toast.success(`Opened \u201c${res.project.name}\u201d`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    }
  }

  function handleSample(): void {
    setError(null);
    setProject(buildSampleProject(), null, null);
    toast("Sample project loaded");
  }

  return (
    <>
      {project ? (
        <Workspace />
      ) : (
        <Welcome onCreate={handleCreate} onOpen={handleOpen} onSample={handleSample} />
      )}
      {project && <Onboarding />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgba(13,13,20,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--color-ink)",
          },
        }}
      />
      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 max-w-sm rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300 shadow-xl"
        >
          {error}
          <button
            className="ml-3 opacity-60 hover:opacity-100"
            onClick={() => setError(null)}
            type="button"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
