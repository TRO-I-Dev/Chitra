import { toPng, toSvg } from "html-to-image";
import {
  projectToEmbedSnippet,
  projectToInteractiveHtml,
  projectToMarkdown,
  projectToMermaid,
  projectToPrintHtml,
} from "@chitra/exports";
import type { Project } from "@chitra/core";
import { projectToDocxBytes } from "./docxBuilder.js";
import { platform } from "../platform/index.js";

const REACT_FLOW_SELECTOR = ".react-flow__viewport";

function findCanvasElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(REACT_FLOW_SELECTOR);
}

function sanitizeFilename(name: string, ext: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  return `${trimmed || "chitra-project"}.${ext}`;
}

async function captureCanvasPng(): Promise<string | undefined> {
  const el = findCanvasElement();
  if (!el) return undefined;
  // backgroundColor matches the studio canvas so the image isn't transparent.
  return toPng(el, { backgroundColor: "#0b0b10", pixelRatio: 2, cacheBust: true });
}

async function captureCanvasSvg(): Promise<string | undefined> {
  const el = findCanvasElement();
  if (!el) return undefined;
  return toSvg(el, { backgroundColor: "#0b0b10", cacheBust: true });
}

/* ------------------------------------------------------------------ *
 *  Public exports                                                     *
 * ------------------------------------------------------------------ */

export async function exportMarkdown(project: Project): Promise<string | null> {
  const text = projectToMarkdown(project);
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "md"),
    filters: [{ name: "Markdown", extensions: ["md"] }],
    payload: { kind: "text", text },
  });
  return res?.path ?? null;
}

export async function exportInteractiveHtml(project: Project): Promise<string | null> {
  const html = projectToInteractiveHtml(project);
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "html"),
    filters: [{ name: "Interactive HTML", extensions: ["html"] }],
    payload: { kind: "text", text: html },
  });
  return res?.path ?? null;
}

export async function exportEmbedSnippet(project: Project): Promise<string | null> {
  const snippet = projectToEmbedSnippet(project);
  // Copy to clipboard for one-click pasting, AND offer a download in case the
  // browser blocks clipboard access.
  try { await navigator.clipboard.writeText(snippet); } catch { /* ignore */ }
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "embed.html"),
    filters: [{ name: "Embed snippet", extensions: ["html"] }],
    payload: { kind: "text", text: snippet },
  });
  return res?.path ?? "copied to clipboard";
}

export async function exportPng(project: Project): Promise<string | null> {
  const dataUrl = await captureCanvasPng();
  if (!dataUrl) throw new Error("Canvas not ready — switch to Structure mode and try again.");
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "png"),
    filters: [{ name: "PNG image", extensions: ["png"] }],
    payload: { kind: "base64", base64 },
  });
  return res?.path ?? null;
}

export async function exportSvg(project: Project): Promise<string | null> {
  const dataUrl = await captureCanvasSvg();
  if (!dataUrl) throw new Error("Canvas not ready — switch to Structure mode and try again.");
  // toSvg returns an `data:image/svg+xml;charset=utf-8,<encoded>` URL.
  const commaIdx = dataUrl.indexOf(",");
  const text = commaIdx >= 0 ? decodeURIComponent(dataUrl.slice(commaIdx + 1)) : dataUrl;
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "svg"),
    filters: [{ name: "SVG image", extensions: ["svg"] }],
    payload: { kind: "text", text },
  });
  return res?.path ?? null;
}

export async function exportPdf(
  project: Project,
  opts: { boardId?: string } = {},
): Promise<string | null> {
  // Try to embed a snapshot of the current canvas (best-effort).
  let canvasImageDataUrl: string | undefined;
  try {
    canvasImageDataUrl = await captureCanvasPng();
  } catch {
    canvasImageDataUrl = undefined;
  }
  const html = projectToPrintHtml(project, {
    ...(canvasImageDataUrl !== undefined ? { canvasImageDataUrl } : {}),
    ...(opts.boardId !== undefined ? { boardId: opts.boardId } : {}),
  });
  const res = await platform.exportPdf({
    suggestedName: sanitizeFilename(project.name, "pdf"),
    html,
    landscape: false,
  });
  return res?.path ?? null;
}

export async function exportDocx(project: Project): Promise<string | null> {
  const bytes = await projectToDocxBytes(project);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  const base64 = btoa(bin);
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "docx"),
    filters: [{ name: "Word document", extensions: ["docx"] }],
    payload: { kind: "base64", base64 },
  });
  return res?.path ?? null;
}

export async function publishNotion(project: Project): Promise<string | null> {
  const res = await platform.publishNotion(project);
  return res?.url ?? null;
}

export async function publishConfluence(project: Project): Promise<string | null> {
  const res = await platform.publishConfluence(project);
  return res?.url ?? null;
}

/* ------------------------------------------------------------------ *
 *  Diagram-only exports                                               *
 * ------------------------------------------------------------------ */

/**
 * Serialize the entire project as pretty-printed JSON. Round-trips through
 * the Project schema in `@chitra/core` for portable backup / programmatic use.
 */
export async function exportJson(project: Project): Promise<string | null> {
  const text = JSON.stringify(project, null, 2);
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "chitra.json"),
    filters: [{ name: "Chitra project JSON", extensions: ["json"] }],
    payload: { kind: "text", text },
  });
  return res?.path ?? null;
}

/**
 * Render the current (or first) board as a Mermaid `flowchart TD` block.
 * Pass `boardId` to target a specific board.
 */
export async function exportMermaid(
  project: Project,
  opts: { boardId?: string } = {},
): Promise<string | null> {
  const text = projectToMermaid(project, opts.boardId);
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(project.name, "mmd"),
    filters: [{ name: "Mermaid diagram", extensions: ["mmd"] }],
    payload: { kind: "text", text },
  });
  return res?.path ?? null;
}

/**
 * One-click "Export diagram as PNG" used by the canvas toolbar. Same capture
 * pipeline as `exportPng` but with a board-aware default filename.
 */
export async function quickExportDiagramPng(
  project: Project,
  boardName?: string,
): Promise<string | null> {
  const dataUrl = await captureCanvasPng();
  if (!dataUrl) throw new Error("Canvas not ready — switch to Structure mode and try again.");
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const suffix = boardName ? `-${boardName}` : "";
  const res = await platform.fileSave({
    suggestedName: sanitizeFilename(`${project.name}${suffix}-diagram`, "png"),
    filters: [{ name: "PNG image", extensions: ["png"] }],
    payload: { kind: "base64", base64 },
  });
  return res?.path ?? null;
}
