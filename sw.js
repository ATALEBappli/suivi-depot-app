// sw.js — Service Worker minimal pour Suivi Depot (PWA)
const VERSION = 'v1.0.0';
const STATIC_CACHE = `suividepot-static-${VERSION}`;

// Fichiers statiques à pré-cacher (optionnel mais conseillé)
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
];

// 1) Installation : met en cache les assets statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 2) Activation : nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// 3) Fetch : stratégies de cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 👉 Ne JAMAIS mettre en cache les appels à l’API Google Apps Script
  // (souvent …/macros/s/.../exec) pour éviter les données périmées.
  if (url.pathname.includes('/macros/s/') && url.pathname.endsWith('/exec')) {
    event.respondWith(fetchWithNoStore(req));
    return;
  }

  // Pour tout le reste : stratégie Network First avec fallback cache
  event.respondWith(networkFirst(req));
});

// ---- Helpers ----

// Force no-cache / no-store pour l’API
async function fetchWithNoStore(request) {
  const noStoreReq = new Request(request, {
    cache: 'no-store',
    headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
  });
  try {
    return await fetch(noStoreReq);
  } catch (e) {
    // En cas d’offline, renvoie un JSON d’erreur simple
    return new Response(
      JSON.stringify({ ok: false, error: 'offline', message: 'API non accessible hors-ligne' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Réseau d’abord, sinon cache (pour HTML/CSS/JS)
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Optionnel : on met à jour le cache pour les fichiers statiques seulement
    if (request.method === 'GET' && isStatic(request.url)) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Fallback très simple si rien
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

function isStatic(url) {
  return (
    url.endsWith('/') ||
    url.endsWith('.html') ||
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.json')
  );
}

