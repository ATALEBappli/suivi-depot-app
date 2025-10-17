// --- Service Worker: v20 (change ce numéro si tu réédites) ---
const SW_VERSION = 'v21';
const CACHE = 'suivi-depot-' + SW_VERSION;

// Optionnel: cache de quelques assets statiques
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js?v=21', // <-- mets la même version que dans index.html
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ✅ NE PAS INTERCEPTER les requêtes externes (autres domaines)
  // (et en particulier script.google.com / googleusercontent.com)
  if (url.origin !== self.location.origin) {
    return; // on laisse le réseau faire (pas de respondWith)
  }

  // Pour nos fichiers statiques du même domaine :
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (event.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});



