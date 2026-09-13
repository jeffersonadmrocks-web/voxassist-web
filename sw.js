/* VoxAssist — Service Worker mínimo (PWA-1).
   Único propósito: satisfazer o critério de instalabilidade do Chrome
   (manifest + HTTPS + Service Worker registrado com fetch handler).
   Não implementa cache, offline, fila ou qualquer lógica além do
   necessário para isso -- autorizado explicitamente com esse escopo. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
