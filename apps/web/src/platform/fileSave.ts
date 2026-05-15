/**
 * Generic file-save dispatch used by the export pipeline. Mirrors the old
 * Electron `file:save` IPC: takes a suggested name, optional file types,
 * and either text or base64 payload. Returns the saved name (or null if
 * the user cancelled).
 *
 * Strategy:
 *  - File System Access API when available (Save dialog, real handle).
 *  - Otherwise an anchor-tag download.
 */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export type FilePayload =
  | { kind: "text"; text: string }
  | { kind: "base64"; base64: string };

export interface FileSaveArgs {
  suggestedName: string;
  filters?: FileFilter[];
  payload: FilePayload;
}

export interface FileSaveResult {
  /** The filename the file was saved as (best-effort). */
  path: string;
}

function payloadToBlob(payload: FilePayload, mimeHint: string): Blob {
  if (payload.kind === "text") {
    return new Blob([payload.text], { type: mimeHint || "text/plain" });
  }
  // base64 → bytes
  const bin = atob(payload.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeHint || "application/octet-stream" });
}

function inferMime(name: string, filters: FileFilter[]): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    png: "image/png",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    json: "application/json",
    chitra: "application/zip",
    zip: "application/zip",
  };
  if (map[ext]) return map[ext];
  // Fallback to the first filter's first extension
  const f = filters[0]?.extensions[0];
  return (f && map[f]) || "application/octet-stream";
}

export async function fileSave(args: FileSaveArgs): Promise<FileSaveResult | null> {
  const filters = args.filters ?? [];
  const mime = inferMime(args.suggestedName, filters);
  const blob = payloadToBlob(args.payload, mime);

  if ("showSaveFilePicker" in window && typeof window.showSaveFilePicker === "function") {
    try {
      const types = filters.map((f) => ({
        description: f.name,
        accept: { [mime]: f.extensions.map((e) => (e.startsWith(".") ? e : `.${e}`)) },
      }));
      const handle = await window.showSaveFilePicker({
        suggestedName: args.suggestedName,
        types: types.length > 0 ? types : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { path: handle.name };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
      throw err;
    }
  }

  // Fallback: anchor-tag download (Firefox/Safari).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.suggestedName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
  return { path: args.suggestedName };
}
