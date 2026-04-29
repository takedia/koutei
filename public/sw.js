// Service Worker: 仮想 URL `/__download/<id>/<filename>` を傍受し、
// 事前にキャッシュ登録された Response（Content-Disposition: attachment 付き）
// を返すことで iOS Safari でも確実にバイナリダウンロードさせる。

const CACHE_NAME = 'koutei-downloads-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // ダウンロード仮想 URL のみ傍受
  if (url.pathname.includes('/__download/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => cache.match(event.request))
        .then(res => res || new Response('Not found', { status: 404 }))
    );
  }
});
