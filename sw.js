// ===== オフラインでも使えるようにするしくみ（サービスワーカー） =====
// アプリのファイルをスマホの中にとっておき、ネットがないときはそれを使う。
// ファイルを変えたら、CACHE の番号を 1 つ上げる。
const CACHE = "tabi-v1";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// 最初に入れたとき：アプリのファイルをまとめてとっておく
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

// 新しい版になったとき：古いとっておきを消す
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // 文字の形（Google Fonts）：とっておいたものがあればそれを使う
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
      )
    );
    return;
  }

  // アプリのファイル：ネットにつながれば新しいものを使い、だめならとっておいたものを使う
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then(
            (cached) => cached || (request.mode === "navigate" ? caches.match("./index.html") : undefined)
          )
        )
    );
  }
});
