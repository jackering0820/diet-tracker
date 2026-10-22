import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const repoPath = (file) => relative(ROOT, join(ROOT, file)).split("\\").join("/");

// service worker 的快取清單（App 外殼）
function cachedFiles() {
  const list = read("sw.js").match(/const SHELL = \[([\s\S]*?)\];/)[1];
  return new Set([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

// App 打開時實際會載入的檔案：index.html 引用的檔案、manifest 裡的圖示、CSS 的 url() 圖片，
// 以及從主程式開始、沿著 import（包含 export … from 和動態載入的 import()）一路找到的每一個模組。
function loadedFiles() {
  const files = new Set();
  const html = read("index.html");
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) files.add(repoPath(ref));
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons) files.add(repoPath(icon.src));
  for (const [, ref] of read("styles.css").matchAll(/url\(\s*["']?([^"')#:]+)["']?\s*\)/g)) files.add(repoPath(ref));

  const queue = [...files].filter((f) => f.endsWith(".js"));
  while (queue.length) {
    const file = queue.shift();
    for (const [, spec] of read(file).matchAll(/(?:^\s*(?:import|export)\s+(?:[^"';]*from\s+)?|\bimport\(\s*)["'](\.[^"']+)["']/gm)) {
      const dep = normalize(join(dirname(file), spec)).split("\\").join("/");
      if (!files.has(dep)) { files.add(dep); queue.push(dep); }
    }
  }
  return files;
}

test("離線也能打開：App 會載入的每一個檔案都在 service worker 的快取清單裡", () => {
  const cached = cachedFiles();
  const missing = [...loadedFiles()].filter((f) => !cached.has(f));
  assert.deepEqual(missing, [], `快取清單漏掉了：${missing.join("、")}（加進 sw.js 的 SHELL，並把 CACHE 版本號加 1）`);
});

test("快取清單裡沒有不存在的檔案（打錯字會讓 service worker 安裝失敗）", () => {
  const broken = [...cachedFiles()].filter((f) => f !== "./" && !existsSync(join(ROOT, f)));
  assert.deepEqual(broken, []);
});
