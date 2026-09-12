/* VoxAssist V0.8.13 — rótulo simples da aba Whirlpool
   Achado em 2026-09-12 (P0 -- travamento do navegador): este arquivo e
   technicianBadge() (os-whirlpool-extension-v0813.js) competiam pelo
   mesmo texto do botão da aba -- este sempre normalizava para
   "WHIRLPOOL", enquanto technicianBadge define "WHIRLPOOL • ATENDIMENTO"
   pra quem é TÉCNICO. Cada um tinha sua própria guarda ("só escreve se
   já não estiver certo"), mas como os dois valores-alvo são diferentes,
   cada mutação de um desfazia a do outro, pra sempre -- um loop
   infinito de DOM entre dois arquivos, não dentro de um só. Corrigido
   aceitando os DOIS valores como corretos aqui. */
(function(){
  const VALID_LABELS=['WHIRLPOOL','WHIRLPOOL • ATENDIMENTO'];
  const VALID_TITLES=['Whirlpool','Modo de atendimento Whirlpool do técnico'];
  function normalizeWhirlpoolTabLabel(){
    document.querySelectorAll('.vx-os-tabs [data-section="whirlpool"]').forEach(function(tab){
      if(!VALID_LABELS.includes(tab.textContent)) tab.textContent = 'WHIRLPOOL';
      if(!VALID_TITLES.includes(tab.title)) tab.title = 'Whirlpool';
    });
  }

  document.addEventListener('click', function(){
    setTimeout(normalizeWhirlpoolTabLabel, 0);
  }, true);

  const observer = new MutationObserver(function(){
    normalizeWhirlpoolTabLabel();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });

  normalizeWhirlpoolTabLabel();
  setTimeout(normalizeWhirlpoolTabLabel, 200);
  setTimeout(normalizeWhirlpoolTabLabel, 800);
})();
