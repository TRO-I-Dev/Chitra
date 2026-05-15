/**
 * PDF export — renders the print-format HTML into a hidden iframe and
 * triggers the browser's print dialog. The user picks "Save as PDF".
 *
 * No headless browser, no server. Works in every modern browser.
 */

export interface ExportPdfArgs {
  suggestedName: string;
  html: string;
  /** Reserved for future @page CSS variants. */
  landscape?: boolean;
}

export interface ExportPdfResult {
  path: string;
}

/**
 * Show the browser print dialog with the given HTML preloaded. Returns
 * once the print dialog has been dismissed (best-effort — there's no
 * reliable cross-browser callback for "saved as PDF").
 */
export async function exportPdf(args: ExportPdfArgs): Promise<ExportPdfResult | null> {
  const html = injectPrintStyles(args.html, args.landscape ?? false, args.suggestedName);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "-10000px";
  frame.style.bottom = "-10000px";
  frame.style.width = "1024px";
  frame.style.height = "768px";
  frame.style.border = "0";
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Could not open print frame.");
  }

  // Best-effort title to seed the saved-PDF filename.
  try {
    if (frame.contentDocument) frame.contentDocument.title = args.suggestedName.replace(/\.pdf$/i, "");
  } catch {
    /* ignore */
  }

  // Give the iframe a tick to lay out images/fonts.
  await new Promise((r) => setTimeout(r, 250));

  win.focus();
  win.print();

  // Clean up after a delay so the print dialog has time to capture.
  setTimeout(() => frame.remove(), 1000);

  return { path: args.suggestedName };
}

function injectPrintStyles(html: string, landscape: boolean, _name: string): string {
  const pageCss = `
    <style id="chitra-print-page">
      @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm; }
      @media print {
        html, body { background: #fff !important; }
      }
    </style>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${pageCss}</head>`);
  }
  // No <head> → wrap.
  return `<!doctype html><html><head><meta charset="utf-8">${pageCss}</head><body>${html}</body></html>`;
}
