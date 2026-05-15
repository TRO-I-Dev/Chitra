import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const URL = process.env.CHITRA_URL || "http://localhost:5180/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chitra-pup-"));
const OUT = path.join(process.cwd(), "tools", "debug-shots");
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  userDataDir,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on("console", (m) => { const t = m.type(); if (t==="log"||t==="error"||t==="warning") console.log(`[browser:${t}]`, m.text()); });
page.on("pageerror", (e) => console.log("[browser:pageerror]", e.message));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

// Make a fresh project
await page.waitForSelector("input", { timeout: 8000 });
const input = await page.$("input");
await input.type("Visual Test");
let btns = await page.$$("button");
for (const b of btns) {
  const t = ((await (await b.getProperty("innerText")).jsonValue()) || "").toLowerCase();
  if (t.includes("create") || t.includes("start")) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 1500));

await page.screenshot({ path: path.join(OUT, "1-empty-board.png") });

// Composer
await page.keyboard.down("Control"); await page.keyboard.press("KeyN"); await page.keyboard.up("Control");
await new Promise(r => setTimeout(r, 600));
const ta = await page.$("textarea");
await ta.type("This card should be VISIBLE on the canvas");
await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
await new Promise(r => setTimeout(r, 4000));

await page.screenshot({ path: path.join(OUT, "2-after-composer.png") });

// Inspect every react-flow node's geometry + style
const report = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
  const viewportEl = document.querySelector(".react-flow__viewport");
  const viewportTransform = viewportEl ? window.getComputedStyle(viewportEl).transform : null;
  const containerRect = document.querySelector(".react-flow")?.getBoundingClientRect();
  return {
    count: nodes.length,
    viewportTransform,
    containerRect,
    nodes: nodes.map((n) => {
      const r = n.getBoundingClientRect();
      const cs = window.getComputedStyle(n);
      const inner = n.querySelector("[data-id], .react-flow__node-default, *");
      const innerRect = inner ? inner.getBoundingClientRect() : null;
      return {
        id: n.getAttribute("data-id"),
        className: n.className,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        transform: cs.transform,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        zIndex: cs.zIndex,
        innerHTML_len: n.innerHTML.length,
        innerRect,
      };
    }),
  };
});
console.log(">> REPORT:", JSON.stringify(report, null, 2));

// Also drag-drop and screenshot
const inboxItem = await page.$("li[draggable='true']");
if (inboxItem) {
  const fb = await inboxItem.boundingBox();
  const cb = await (await page.$(".react-flow")).boundingBox();
  await page.mouse.move(fb.x + fb.width/2, fb.y + fb.height/2);
  await page.mouse.down();
  await page.mouse.move(fb.x + 20, fb.y + 20, { steps: 5 });
  await page.mouse.move(cb.x + cb.width/2 + 200, cb.y + cb.height/2 + 100, { steps: 15 });
  await new Promise(r => setTimeout(r, 300));
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT, "3-after-drag.png") });
  const after = await page.$$eval(".react-flow__node", n => n.length);
  console.log(">> nodes after drag:", after);
}

await browser.close();
console.log(">> screenshots in", OUT);
