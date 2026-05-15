import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const URL = process.env.CHITRA_URL || "http://localhost:5180/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chitra-pup-"));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  userDataDir,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "log" || t === "error" || t === "warning") {
    console.log(`[browser:${t}]`, msg.text());
  }
});
page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
console.log(">> page loaded");

// Click the Sample button on Welcome
await page.waitForSelector("button", { timeout: 10000 });
const buttons = await page.$$("button");
let sampleBtn = null;
for (const b of buttons) {
  const txt = (await (await b.getProperty("innerText")).jsonValue() || "").toString().toLowerCase();
  if (txt.includes("sample") || txt.includes("walkthrough")) {
    sampleBtn = b;
    break;
  }
}
if (sampleBtn) {
  // Skip sample; create fresh project to repro the empty-project bug
  console.log(">> sample btn found but using new-project path instead");
}
{
  const input = await page.$("input");
  if (input) {
    await input.click({ clickCount: 3 });
    await input.type("Debug Project");
    const btns2 = await page.$$("button");
    for (const b of btns2) {
      const txt = ((await (await b.getProperty("innerText")).jsonValue()) || "").toString().toLowerCase();
      if (txt.includes("create") || txt.includes("new project") || txt.includes("start")) { await b.click(); console.log(">> clicked", txt); break; }
    }
  }
}

await new Promise((r) => setTimeout(r, 1500));

// Open composer via Cmd+N
await page.keyboard.down("Control");
await page.keyboard.press("KeyN");
await page.keyboard.up("Control");
console.log(">> sent Ctrl+N");

await new Promise((r) => setTimeout(r, 800));

// Type into the textarea and submit with Ctrl+Enter
const ta = await page.$("textarea");
if (!ta) {
  console.log(">> no textarea found; composer may not be open");
} else {
  await ta.type("This is a test risk that should appear on the canvas");
  console.log(">> typed text");
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  console.log(">> sent Ctrl+Enter to submit");
}

await new Promise((r) => setTimeout(r, 1500));

// Count how many .react-flow__node elements are on the page
const nodeCount = await page.$$eval(".react-flow__node", (nodes) => nodes.length);
console.log(">> react-flow node count after composer:", nodeCount);

// Try opening composer again and creating a SECOND card
await page.keyboard.down("Control");
await page.keyboard.press("KeyN");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 600));
const ta2 = await page.$("textarea");
if (ta2) {
  await ta2.type("Second card to test rapid add");
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  console.log(">> sent second submit");
}
await new Promise((r) => setTimeout(r, 1500));
const nodeCount2 = await page.$$eval(".react-flow__node", (nodes) => nodes.length);
console.log(">> react-flow node count after 2nd composer:", nodeCount2);

// Try clicking the + Canvas button on an inbox row, if any
const plusCanvasBtn = await page.evaluateHandle(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  return btns.find((b) => b.textContent && b.textContent.includes("+ Canvas")) || null;
});
if (plusCanvasBtn && (await plusCanvasBtn.asElement())) {
  await (await plusCanvasBtn.asElement()).click();
  console.log(">> clicked + Canvas");
  await new Promise((r) => setTimeout(r, 800));
  const nodeCount3 = await page.$$eval(".react-flow__node", (nodes) => nodes.length);
  console.log(">> react-flow node count after + Canvas:", nodeCount3);
}

await browser.close();
