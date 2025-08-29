self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => self.clients.claim());
// Pas de fetch handler => pas de mise en cache
