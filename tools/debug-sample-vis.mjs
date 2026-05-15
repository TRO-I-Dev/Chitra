import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const URL = process.env.CHITRA_URL || "http://localhost:5180/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chitra-pup-"));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", userDataDir, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on("console", (m) => { if (m.type()==="error") console.log("[err]", m.text()); });
await page.goto(URL, { waitUntil: "networkidle2" });
const btns = await page.$$("button");
for (const b of btns) {
  const t = ((await (await b.getProperty("innerText")).jsonValue()) || "").toLowerCase();
  if (t.includes("sample") || t.includes("walkthrough")) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 4000));
const r = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".react-flow__node")).map(n => ({
    id: n.getAttribute("data-id"),
    visibility: getComputedStyle(n).visibility,
    width: n.getBoundingClientRect().width,
  }));
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
