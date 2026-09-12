/* VoxAssist V0.8.13 — hotfix de layout do modo Whirlpool
   Guarda de visibilidade adicionada em 2026-09-12 (mesmo achado de
   whirlpool-a4-fidelity-hotfix-v0813.js: trocar de aba só oculta o painel,
   nunca o remove -- sem isso, fix() e seu setInterval(1000) rodavam pra
   sempre em cada mutação global mesmo com o Whirlpool oculto). */
(function(){
  function fix(){
    const tabs=document.querySelector('.vx-os-tabs');
    const panel=document.querySelector('#vx-whirlpool');
    if(!tabs||!panel)return;
    if(panel.classList.contains('hidden'))return;
    // O painel Whirlpool deve ocupar a mesma região visual das demais abas,
    // imediatamente abaixo das abas, nunca no fim do #app.
    if(panel.previousElementSibling!==tabs) tabs.insertAdjacentElement('afterend',panel);
    panel.style.margin='0';
    panel.style.padding='12px 8px 24px';
    panel.style.minHeight='0';
    panel.style.height='auto';
    panel.style.position='relative';
    panel.style.top='0';
    panel.style.display=panel.classList.contains('hidden')?'none':'block';
    const box=panel.querySelector('.vx-screen-box');
    if(box){box.style.margin='0';box.style.minHeight='0';box.style.height='auto';}
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-section="whirlpool"]')) setTimeout(fix,0);
    else if(e.target.closest('.vx-os-tabs button')) setTimeout(()=>{
      const p=document.querySelector('#vx-whirlpool');
      if(p&&p.classList.contains('hidden'))p.style.display='none';
    },0);
  },true);
  const mo=new MutationObserver(()=>fix());
  mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  setInterval(fix,1000);
})();