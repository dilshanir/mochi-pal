// Service worker: lets Mochi Pal open offline and load instantly on repeat visits.
//
// Strategy: "stale-while-revalidate". Serve the cached copy at once, fetch a fresh copy
// in the background for next time, so players never wait on the network.
// IMPORTANT: bump VERSION whenever you deploy, so old caches are cleared.
const VERSION = 'mochi-pal-v1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/store.js', 'js/data.js', 'js/util.js', 'js/pet.js', 'js/fx.js',
  'js/ui.js', 'js/games.js', 'js/sfx.js', 'js/voice.js',
  'fonts/mochiy-pop-one-latin-400-normal.woff2',
  'fonts/zen-maru-gothic-latin-500-normal.woff2',
  'fonts/zen-maru-gothic-latin-700-normal.woff2',
  'fonts/zen-maru-gothic-latin-900-normal.woff2',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Delete caches from older versions.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let the browser handle anything external

  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => hit || c.match('index.html')); // offline: fall back to the app shell
    return hit || fresh;
  }));
});
