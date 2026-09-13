/* VoxAssist — PWA-1: registro do Service Worker + captura do evento de
   instalação. Não bloqueia o boot do app (roda só depois de 'load') e não
   falha nada se o navegador não suportar Service Worker/instalação --
   apenas guarda o evento em window.vxInstallPrompt pra uso futuro (ex.:
   um botão "Instalar" na tela "Mais"). */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // updateViaCache:'none' -- achado do usuário (2026-09-13): o PWA
      // instalado carregava telas antigas com frequência (chegou a
      // mostrar a "Central diária de trabalho" antiga, de antes do
      // dashboard canônico). Sem isso, o PRÓPRIO sw.js pode ser servido
      // do cache HTTP do navegador quando o Chrome faz sua checagem
      // periódica de atualização do Service Worker, atrasando ainda
      // mais a detecção de uma versão nova num app que agora fica vivo
      // em segundo plano por muito mais tempo (é um PWA instalado, não
      // uma aba que o usuário fecha e reabre toda hora).
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
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
