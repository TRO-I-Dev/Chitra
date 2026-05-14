import { useState } from "react";
import { useProjectStore } from "./state/projectStore.js";
import { Welcome } from "./views/Welcome.js";
import { Workspace } from "./views/Workspace.js";
import { Onboarding } from "./views/Onboarding.js";
import { buildSampleProject } from "./samples/sampleProject.js";

export function App(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(name: string): Promise<void> {
    setError(null);
    try {
      const p = await window.chitra.projectNew({ name });
      setProject(p, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleOpen(path?: string): Promise<void> {
    setError(null);
    try {
      const res = await window.chitra.projectOpen({ path });
      if (res) setProject(res.project, res.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleSample(): void {
    setError(null);
    setProject(buildSampleProject(), null);
  }

  return (
    <>
      {project ? (
        <Workspace />
      ) : (
        <Welcome onCreate={handleCreate} onOpen={handleOpen} onSample={handleSample} />
      )}
      {project && <Onboarding />}
      {error && (
        <div className="fixed bottom-4 right-4 max-w-sm rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300 shadow-xl">
          {error}
          <button
            className="ml-3 opacity-60 hover:opacity-100"
            onClick={() => setError(null)}
            type="button"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
