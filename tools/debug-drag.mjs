import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const URL = process.env.CHITRA_URL || "http://localhost:5179/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chitra-pup-"));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  userDataDir,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "log" || t === "error" || t === "warning") {
    console.log(`[browser:${t}]`, msg.text());
  }
});
page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
console.log(">> page loaded");

// Create new empty project instead of sample
const input = await page.$("input");
if (input) {
  await input.click({ clickCount: 3 });
  await input.type("Drag Test Project");
  const btns = await page.$$("button");
  for (const b of btns) {
    const txt = ((await (await b.getProperty("innerText")).jsonValue()) || "").toString().toLowerCase();
    if (txt.includes("create") || txt.includes("start") || txt.includes("new project")) { await b.click(); console.log(">> clicked", txt); break; }
  }
}
await new Promise((r) => setTimeout(r, 1500));

// Add a card to the inbox via Ctrl+N
await page.keyboard.down("Control"); await page.keyboard.press("KeyN"); await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 600));
const ta = await page.$("textarea");
if (ta) {
  await ta.type("A draggable card");
  // Look for an "Add to inbox" or similar — for now just close composer with Esc and assume the card was added... actually we need to submit. Use Ctrl+Enter which submits.
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
}
await new Promise((r) => setTimeout(r, 1200));

// Find the inbox list (right side panel) — look for a draggable LI
const beforeNodes = await page.$$eval(".react-flow__node", (n) => n.length);
console.log(">> initial node count:", beforeNodes);

// Instrument the drag/drop pipeline before performing the drag
await page.evaluate(() => {
  const log = (...args) => console.log("[chitra/drag]", ...args);
  document.addEventListener("dragstart", (e) => log("dragstart on", (e.target).tagName, (e.target).className?.slice?.(0, 40)), true);
  document.addEventListener("dragenter", (e) => log("dragenter on", (e.target).tagName), true);
  document.addEventListener("dragover", (e) => log("dragover on", (e.target).tagName, "defaultPrevented=", e.defaultPrevented), true);
  document.addEventListener("drop", (e) => log("drop on", (e.target).tagName, "types=", Array.from(e.dataTransfer?.types || [])), true);
  document.addEventListener("dragend", () => log("dragend"), true);
});

// Find a draggable inbox item
const inboxItem = await page.$("li[draggable='true']");
if (!inboxItem) { console.log(">> NO draggable inbox item found"); await browser.close(); process.exit(1); }

const fromBox = await inboxItem.boundingBox();
const canvasEl = await page.$(".react-flow");
const canvasBox = await canvasEl.boundingBox();
const fromX = fromBox.x + fromBox.width / 2;
const fromY = fromBox.y + fromBox.height / 2;
const toX = canvasBox.x + canvasBox.width / 2;
const toY = canvasBox.y + canvasBox.height / 2;
console.log(">> drag from", fromX, fromY, "to", toX, toY);

// Use CDP to dispatch real HTML5 drag events
const client = await page.target().createCDPSession();
await client.send("Input.setInterceptDrags", { enabled: true });

// Manual drag with mouse + DataTransfer events
await page.mouse.move(fromX, fromY);
await page.mouse.down();
await page.mouse.move(fromX + 20, fromY + 20, { steps: 5 });
await page.mouse.move(toX, toY, { steps: 15 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.up();

await new Promise((r) => setTimeout(r, 1500));
const afterNodes = await page.$$eval(".react-flow__node", (n) => n.length);
console.log(">> node count after drag:", afterNodes, "(expected", beforeNodes + 1, ")");

await browser.close();
