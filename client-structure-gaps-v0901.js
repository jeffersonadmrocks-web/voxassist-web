/* VoxAssist — lacunas visuais de Cliente 360 (Consolidação Geral, 2026-09-01)
 * Transferência de titularidade não existe em nenhum lugar do sistema
 * hoje (achado da auditoria) -- adiciona o botão real dentro de
 * Cliente 360, abrindo a mesma "Estrutura disponível" já usada em
 * outros lugares, nunca um botão morto nem uma regra inventada.
 */
(function(){
  'use strict';
  const E=window.esc||((v='')=>String(v??''));

  function openStructureModal(title,detail){
    document.querySelector('#vxStructureModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxStructureModal';
    bg.className='vx-modal-bg';
    const panel=typeof window.vxStructurePanel==='function'?window.vxStructurePanel(title,detail):`<p>${E(detail)}</p>`;
    bg.innerHTML=`<div class="vx-modal">${panel}<div class="vx-modal-actions"><button type="button" data-close>Fechar</button></div></div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-close]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
  }
  window.vxOpenTitularidade=function(clientId,clientName){
    openStructureModal('Transferência de titularidade',`Transferir a titularidade de um equipamento entre clientes ainda não tem tela própria. Hoje, o vínculo entre equipamento e cliente é feito ao abrir uma nova O.S. — o histórico da O.S. anterior continua vinculado ao cliente original. Cliente atual: ${E(clientName||'')}.`);
  };

  function injectButton(){
    const app=document.querySelector('#app');
    if(!app)return;
    const actions=app.querySelector('.actions');
    if(!actions||actions.querySelector('[data-titularidade]'))return;
    const nameEl=app.querySelector('.detail-grid h2');
    const clientName=nameEl?nameEl.textContent:'';
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='secondary';
    btn.dataset.titularidade='1';
    btn.textContent='Transferir titularidade';
    btn.onclick=()=>window.vxOpenTitularidade(window.__vxLastClient360Id||'',clientName);
    actions.appendChild(btn);
  }

  const base=window.renderClient360;
  if(typeof base==='function'){
    window.renderClient360=async function(id){
      window.__vxLastClient360Id=id;
      const r=await base.apply(this,arguments);
      setTimeout(injectButton,30);
      return r;
    };
  }
})();
