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
  // Achado do usuário em 2026-09-27: repassar TODA requisição por fetch()
  // de novo, inclusive as de outro domínio (ex.: pdf.js do cdnjs,
  // adicionado nesta sessão), causava "Failed to fetch" nesse repasse --
  // bloqueador de anúncio/extensão do navegador costuma brigar com isso.
  // Requisição de outro domínio: nunca intercepta, deixa o navegador
  // cuidar sozinho (mesmo comportamento de não ter Service Worker nenhum
  // pra esse caso). Mesma origem: mantém o repasse (sem cache, por
  // escopo -- ver comentário no topo do arquivo), só com .catch() pra
  // nunca deixar uma promise rejeitada sem tratamento no console.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => Response.error()));
});
