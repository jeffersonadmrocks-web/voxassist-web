/* VoxAssist V0.8.13 — rótulo simples da aba Whirlpool */
(function(){
  function normalizeWhirlpoolTabLabel(){
    document.querySelectorAll('.vx-os-tabs [data-section="whirlpool"]').forEach(function(tab){
      if(tab.textContent !== 'WHIRLPOOL') tab.textContent = 'WHIRLPOOL';
      tab.title = 'Whirlpool';
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
