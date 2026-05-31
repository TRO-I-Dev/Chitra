/**
 * Build Chitra-Documentation.docx from the markdown files in docs/.
 *
 * Run from repo root:
 *   node tools/build-docs-docx.mjs
 *
 * Uses the `docx` package already in the workspace (apps/web depends on it).
 * The markdown parser here is intentionally narrow — it handles the subset
 * actually used in docs/: ATX headings, paragraphs (with inline `code`,
 * **bold**, *italic*, [text](url)), bullet/numbered lists, fenced code
 * blocks, simple GFM tables, blockquotes, and `mermaid` blocks (rendered
 * as a styled code block — Word can't render Mermaid natively).
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// docx 8 is ESM-only; load it via dynamic import from the pnpm store.
const DOCX_ENTRY = join(ROOT, "node_modules/.pnpm/docx@8.5.0/node_modules/docx/build/index.mjs");
const docx = await import(pathToFileURL(DOCX_ENTRY).href);
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ExternalHyperlink,
  PageBreak,
  ShadingType,
  TabStopType,
  TabStopPosition,
  LevelFormat,
} = docx;

const MD_DIR = join(ROOT, "docs");
const OUT = join(MD_DIR, "Chitra-Documentation.docx");

const FILES = [
  "01-overview.md",
  "02-tech-stack.md",
  "03-architecture.md",
  "04-features.md",
  "05-getting-started.md",
  "06-project-structure.md",
  "07-data-model.md",
  "08-keyboard-and-ux.md",
  "09-deployment.md",
  "10-faq.md",
];

// ---------------------------------------------------------------- inline parsing

/** Convert a string with **bold**, *italic*, `code`, [link](url) to TextRun[]. */
function inlineRuns(md, base = {}) {
  const runs = [];
  let i = 0;
  while (i < md.length) {
    // [text](url)
    const link = /^\[([^\]]+)\]\(([^)]+)\)/.exec(md.slice(i));
    if (link) {
      runs.push(
        new ExternalHyperlink({
          link: link[2],
          children: [new TextRun({ ...base, text: link[1], style: "Hyperlink", color: "1F6FEB", underline: {} })],
        }),
      );
      i += link[0].length;
      continue;
    }
    // `code`
    if (md[i] === "`") {
      const end = md.indexOf("`", i + 1);
      if (end > i) {
        runs.push(
          new TextRun({
            ...base,
            text: md.slice(i + 1, end),
            font: "Consolas",
            shading: { type: ShadingType.CLEAR, fill: "F1F3F5", color: "auto" },
          }),
        );
        i = end + 1;
        continue;
      }
    }
    // **bold**
    if (md.startsWith("**", i)) {
      const end = md.indexOf("**", i + 2);
      if (end > i) {
        runs.push(...inlineRuns(md.slice(i + 2, end), { ...base, bold: true }));
        i = end + 2;
        continue;
      }
    }
    // *italic* or _italic_
    if ((md[i] === "*" || md[i] === "_") && md[i + 1] !== md[i]) {
      const ch = md[i];
      const end = md.indexOf(ch, i + 1);
      if (end > i && /\S/.test(md.slice(i + 1, end))) {
        runs.push(...inlineRuns(md.slice(i + 1, end), { ...base, italics: true }));
        i = end + 1;
        continue;
      }
    }
    // plain run until next special char
    const next = md.slice(i).search(/[`*_\[]/);
    const stop = next === -1 ? md.length : i + next;
    if (stop > i) {
      runs.push(new TextRun({ ...base, text: md.slice(i, stop) }));
      i = stop;
    } else {
      runs.push(new TextRun({ ...base, text: md[i] }));
      i++;
    }
  }
  return runs;
}

// ---------------------------------------------------------------- block parsing

function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // ATX heading
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // table — header row + separator row
    if (/^\s*\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [];
      const splitRow = (s) =>
        s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      rows.push(splitRow(line));
      i += 2; // skip header + separator
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // blank
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // paragraph — accumulate until blank / new block marker
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !/^\s*\|.+\|\s*$/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

// ---------------------------------------------------------------- block → docx

const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function renderBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "heading") {
      out.push(
        new Paragraph({
          heading: HEADING_MAP[b.level],
          children: inlineRuns(b.text),
          spacing: { before: 280, after: 120 },
        }),
      );
    } else if (b.type === "p") {
      out.push(
        new Paragraph({
          children: inlineRuns(b.text),
          spacing: { after: 140 },
        }),
      );
    } else if (b.type === "ul") {
      for (const it of b.items) {
        out.push(
          new Paragraph({
            children: inlineRuns(it),
            bullet: { level: 0 },
            spacing: { after: 60 },
          }),
        );
      }
    } else if (b.type === "ol") {
      for (const it of b.items) {
        out.push(
          new Paragraph({
            children: inlineRuns(it),
            numbering: { reference: "ordered", level: 0 },
            spacing: { after: 60 },
          }),
        );
      }
    } else if (b.type === "quote") {
      out.push(
        new Paragraph({
          children: inlineRuns(b.text, { italics: true, color: "555555" }),
          indent: { left: 480 },
          spacing: { after: 140 },
          shading: { type: ShadingType.CLEAR, fill: "F8F9FA", color: "auto" },
        }),
      );
    } else if (b.type === "code") {
      const codeLines = b.text.length > 0 ? b.text.split("\n") : [""];
      const isMermaid = b.lang === "mermaid";
      if (isMermaid) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: "Diagram (Mermaid):", italics: true, color: "555555", size: 18 })],
            spacing: { before: 80, after: 40 },
          }),
        );
      }
      for (const ln of codeLines) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: ln || " ", font: "Consolas", size: 18 })],
            shading: { type: ShadingType.CLEAR, fill: isMermaid ? "EEF2F7" : "F6F8FA", color: "auto" },
            spacing: { after: 0 },
          }),
        );
      }
      out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 100 } }));
    } else if (b.type === "table") {
      const [header, ...body] = b.rows;
      const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
      const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
      const rows = [];
      rows.push(
        new TableRow({
          tableHeader: true,
          children: header.map(
            (c) =>
              new TableCell({
                borders,
                shading: { type: ShadingType.CLEAR, fill: "0B0B10", color: "auto" },
                children: [
                  new Paragraph({ children: inlineRuns(c, { bold: true, color: "FFFFFF" }) }),
                ],
              }),
          ),
        }),
      );
      for (const r of body) {
        rows.push(
          new TableRow({
            children: r.map(
              (c) =>
                new TableCell({
                  borders,
                  children: [new Paragraph({ children: inlineRuns(c) })],
                }),
            ),
          }),
        );
      }
      out.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      );
      out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- assemble

function titleBlock() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 200 },
      children: [new TextRun({ text: "Chitra", bold: true, size: 96, color: "0B0B10" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Writing-to-card studio for architecture & business plans",
          italics: true,
          size: 28,
          color: "555555",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "Project Documentation", size: 24, color: "555555" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: `Generated ${new Date().toISOString().slice(0, 10)}`,
          size: 20,
          color: "888888",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function tocBlock() {
  const items = [
    ["1.", "Overview"],
    ["2.", "Tech Stack"],
    ["3.", "Architecture"],
    ["4.", "Features"],
    ["5.", "Getting Started"],
    ["6.", "Project Structure"],
    ["7.", "Data Model"],
    ["8.", "Keyboard & UX"],
    ["9.", "Deployment"],
    ["10.", "FAQ & Troubleshooting"],
  ];
  const out = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Contents", bold: true })],
      spacing: { before: 200, after: 200 },
    }),
  ];
  for (const [n, label] of items) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `${n}  ${label}`, size: 24 })],
        spacing: { after: 80 },
      }),
    );
  }
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

const children = [...titleBlock(), ...tocBlock()];

for (let idx = 0; idx < FILES.length; idx++) {
  const f = FILES[idx];
  const md = readFileSync(join(MD_DIR, f), "utf8");
  const blocks = parseBlocks(md);
  children.push(...renderBlocks(blocks));
  if (idx < FILES.length - 1) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
}

const doc = new Document({
  creator: "Chitra docs build",
  title: "Chitra — Project Documentation",
  description: "Generated from docs/*.md",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
        paragraph: { spacing: { line: 300 } },
      },
      heading1: {
        run: { font: "Calibri", size: 40, bold: true, color: "0B0B10" },
        paragraph: { spacing: { before: 360, after: 160 } },
      },
      heading2: {
        run: { font: "Calibri", size: 32, bold: true, color: "1F2937" },
        paragraph: { spacing: { before: 280, after: 120 } },
      },
      heading3: {
        run: { font: "Calibri", size: 26, bold: true, color: "374151" },
        paragraph: { spacing: { before: 220, after: 100 } },
      },
      heading4: {
        run: { font: "Calibri", size: 22, bold: true, color: "4B5563" },
        paragraph: { spacing: { before: 180, after: 80 } },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "ordered",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 480, hanging: 240 } } },
          },
        ],
      },
    ],
  },
  sections: [{ children }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log(`Wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB)`);
