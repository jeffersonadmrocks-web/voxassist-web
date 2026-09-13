/* VoxAssist — PWA-1: registro do Service Worker + captura do evento de
   instalação. Não bloqueia o boot do app (roda só depois de 'load') e não
   falha nada se o navegador não suportar Service Worker/instalação --
   apenas guarda o evento em window.vxInstallPrompt pra uso futuro (ex.:
   um botão "Instalar" na tela "Mais"). */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.vxInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    window.vxInstallPrompt = null;
  });
})();
