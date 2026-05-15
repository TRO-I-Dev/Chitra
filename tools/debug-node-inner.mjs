import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chitra-pup-"));
const browser = await puppeteer.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: "new", userDataDir, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto("http://localhost:5180/", { waitUntil: "networkidle2" });
const btns = await page.$$("button");
for (const b of btns) {
  const t = ((await (await b.getProperty("innerText")).jsonValue()) || "").toLowerCase();
  if (t.includes("sample")) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 3000));
const r = await page.evaluate(() => {
  const node = document.querySelector(".react-flow__node");
  if (!node) return { err: "no node" };
  const inner = node.firstElementChild;
  const wrapStyle = window.getComputedStyle(node);
  const innerStyle = inner ? window.getComputedStyle(inner) : null;
  return {
    nodeOuterHTML: node.outerHTML.slice(0, 400),
    nodeWrapStyle: { width: wrapStyle.width, transform: wrapStyle.transform, position: wrapStyle.position, visibility: wrapStyle.visibility },
    innerTagAndClass: inner ? { tag: inner.tagName, className: inner.className.slice(0, 200) } : null,
    innerStyle: innerStyle ? { width: innerStyle.width, height: innerStyle.height, display: innerStyle.display } : null,
    innerRect: inner ? { w: inner.getBoundingClientRect().width, h: inner.getBoundingClientRect().height } : null,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
