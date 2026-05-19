import type { CardType } from "@chitra/core";

export interface ImportedRow {
  title: string;
  type: CardType;
  bodyText: string;
  tags: string[];
}

const VALID_TYPES: CardType[] = [
  "note", "decision", "risk", "goal", "metric", "persona", "step", "data", "component",
];

function coerceType(t: unknown): CardType {
  if (typeof t !== "string") return "note";
  const lower = t.trim().toLowerCase() as CardType;
  return VALID_TYPES.includes(lower) ? lower : "note";
}

/** Parse a CSV string. Supports quoted fields, escaped quotes (""), and
 *  CRLF/LF line endings. Returns rows of cells. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Convert raw CSV rows (with header on row 0) into ImportedRow objects.
 *  Recognised column names (case-insensitive): title, type, body, tags. */
export function csvToRows(rows: string[][]): ImportedRow[] {
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);
  const titleIdx = idx("title");
  const typeIdx = idx("type");
  const bodyIdx = idx("body") >= 0 ? idx("body") : idx("description");
  const tagsIdx = idx("tags");

  return rows.slice(1).map((cells) => ({
    title: (titleIdx >= 0 ? cells[titleIdx] : cells[0] ?? "").trim() || "Untitled",
    type: coerceType(typeIdx >= 0 ? cells[typeIdx] : undefined),
    bodyText: bodyIdx >= 0 ? (cells[bodyIdx] ?? "").trim() : "",
    tags: tagsIdx >= 0
      ? (cells[tagsIdx] ?? "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [],
  })).filter((r) => r.title.length > 0);
}

/** Convert a JSON string into ImportedRow objects. Accepts an array of
 *  objects with `title` (required) and optional `type`/`body`/`tags`. */
export function jsonToRows(input: string): ImportedRow[] {
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON import expects an array of objects.");
  }
  return parsed
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r) => ({
      title: typeof r.title === "string" ? r.title.trim() : "Untitled",
      type: coerceType(r.type),
      bodyText: typeof r.body === "string" ? r.body : (typeof r.description === "string" ? r.description : ""),
      tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    }))
    .filter((r) => r.title.length > 0);
}

/** Top-level dispatcher: sniff content type and return rows. */
export function importRows(text: string, filename?: string): ImportedRow[] {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("[") || (filename ?? "").toLowerCase().endsWith(".json");
  if (looksJson) return jsonToRows(trimmed);
  return csvToRows(parseCsv(text));
}
