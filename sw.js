// Service worker：讓 App 外殼在沒有網路時也能打開。
// 策略是「網路優先」：有網路就拿最新版並更新快取，沒網路才用快取。
const CACHE = "diet-tracker-v5";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "src/ui/app.js",
  "src/ui/dom.js",
  "src/ui/goals-view.js",
  "src/ui/meal-editor.js",
  "src/core/diary.js",
  "src/core/day.js",
  "src/core/meal.js",
  "src/core/goals.js",
  "src/core/format.js",
  "src/adapters/indexeddb-storage.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
