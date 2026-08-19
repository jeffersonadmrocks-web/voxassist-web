/* VoxAssist Web V0.8.12 — Loja Virtual em destaque na base do menu */
(function(){
  const previousShell=window.shell;
  function enhanceSidebar(){
    const sidebar=document.querySelector('.desktop-sidebar');
    const menu=sidebar?.querySelector('.desktop-menu');
    if(!sidebar||!menu)return;

    // Remove Loja Virtual do bloco operacional principal.
    menu.querySelector('[data-view="estoque"]')?.remove();

    // O Legado System3 permanece somente no menu original inferior.
    // Não criar um segundo atalho no bloco especial.
    let special=sidebar.querySelector('.desktop-special-menu');
    if(!special){
      special=document.createElement('div');
      special.className='desktop-special-menu';
      special.innerHTML=`
        <button type="button" class="virtual-store-card" data-special-view="estoque" aria-label="Abrir Loja Virtual">
          <span class="shop-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img"><path d="M14 24h36l-4 24H18L14 24Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M22 24l7-12h6l7 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M21 32h26M20 40h27M28 25v23M38 25v23" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>
          </span>
          <span class="shop-copy"><strong>LOJA VIRTUAL</strong><small>Vendas e integrações online</small></span>
        </button>`;
      const version=sidebar.querySelector('.desktop-version');
      sidebar.insertBefore(special,version||null);
    } else {
      special.querySelector('.legacy-system3-btn')?.remove();
    }

    special.querySelectorAll('[data-special-view]').forEach(b=>{
      b.onclick=()=>window.render(b.dataset.specialView);
    });
  }

  window.shell=function(){
    const out=previousShell.apply(this,arguments);
    enhanceSidebar();
    return out;
  };

  const style=document.createElement('style');
  style.textContent=`
    .desktop-sidebar{display:flex;flex-direction:column;min-height:100vh;box-sizing:border-box}
    .desktop-menu{flex:0 0 auto}
    .desktop-special-menu{margin-top:auto;padding:12px 0 56px;display:flex;flex-direction:column;gap:8px}
    .virtual-store-card{width:100%;min-height:92px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:linear-gradient(145deg,#7cc900,#55a900);color:#fff;padding:12px 10px;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.16);transition:transform .15s ease,filter .15s ease,box-shadow .15s ease}
    .virtual-store-card:hover{transform:translateY(-1px);filter:brightness(1.04);box-shadow:0 10px 22px rgba(0,0,0,.2)}
    .shop-icon{width:52px;height:52px;flex:0 0 52px;border-radius:12px;background:rgba(255,255,255,.16);display:grid;place-items:center}
    .shop-icon svg{width:43px;height:43px}
    .shop-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
    .shop-copy strong{font-size:13px;letter-spacing:.2px}.shop-copy small{font-size:9px;line-height:1.25;color:#efffdc}
    @media(max-height:720px){.desktop-special-menu{padding-bottom:46px}.virtual-store-card{min-height:76px}.shop-icon{width:42px;height:42px;flex-basis:42px}.shop-icon svg{width:35px;height:35px}}
  `;
  document.head.appendChild(style);
})();
