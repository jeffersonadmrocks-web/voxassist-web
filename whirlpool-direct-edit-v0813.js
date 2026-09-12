/* VoxAssist V0.8.13 — barra de modo (visualizar/editar/edição avançada) da OS Whirlpool
   Correção de arquitetura em 2026-09-12: este arquivo antes apagava o
   documento inteiro (form.innerHTML='') e reconstruía sua PRÓPRIA
   tabela com um subconjunto de ~25 campos, além de ter sua PRÓPRIA
   setMode() com uma lista fixa de "campos editáveis no modo básico"
   (STANDARD_EDIT). Isso destruía os campos exclusivos do documento
   fiel (REGIÃO, LOCALIZAÇÃO, FONE OUTROS, INSC. ESTADUAL, etc. --
   nenhum deles fazia parte do subconjunto reconstruído aqui) sempre
   que rodava antes de whirlpool-complete-factory-v0813.js terminar de
   montar o documento, e quando rodava depois, criava uma segunda
   tabela duplicada visível. whirlpool-complete-factory-v0813.js já tem
   sua PRÓPRIA setMode(), mais completa (usa o atributo `data-edit` de
   cada campo do documento fiel, marcado na hora da montagem, em vez de
   uma lista solta mantida à parte) e já procura por `#vxWpModeBar` pra
   ligar seus botões. Este arquivo agora só cria essa barra (e o botão
   "EDIÇÃO AVANÇADA" continua exclusivo do GESTOR) -- nunca mais mexe
   no conteúdo do formulário. */
(function(){
  const ROLE = ()=>String((typeof state!=='undefined'&&state?.profile?.role)||'').toUpperCase();
  const canAdvanced = ()=>ROLE()==='GESTOR';
  const $=(s,r=document)=>r.querySelector(s);
  function installStyle(){if($('#vxWpDirectStyle'))return;const s=document.createElement('style');s.id='vxWpDirectStyle';s.textContent=`
  .vx-wp-modebar{display:flex;gap:7px;align-items:center;margin-left:auto}.vx-wp-modebar button{border:1px solid #b9c5d1;background:#fff;padding:7px 11px;font-weight:700;cursor:pointer}.vx-wp-modebar button.active{background:#0c2340;color:#fff}.vx-wp-modebar button:disabled{opacity:.45;cursor:not-allowed}.vx-wp-mode-status{font-size:11px;color:#526579;margin-right:6px}
  #vxWpSave:disabled{opacity:.45;cursor:not-allowed}
  @media(max-width:900px){.vx-wp-modebar{flex-wrap:wrap}}
  `;document.head.appendChild(s)}
  function ensureModeBar(){
    const form=$('#vxWpForm'); if(!form||form.dataset.wpModeBarInstalled==='1')return;
    installStyle();
    const head=$('#vx-whirlpool .vx-wp-head');
    if(head&&!$('#vxWpModeBar')){
      const bar=document.createElement('div');bar.id='vxWpModeBar';bar.className='vx-wp-modebar';
      bar.innerHTML=`<span id="vxWpModeStatus" class="vx-wp-mode-status">Visualização protegida</span><button type="button" data-wp-mode="view">VISUALIZAR</button><button type="button" data-wp-mode="basic">EDITAR</button><button type="button" data-wp-mode="advanced" ${canAdvanced()?'':'disabled title="Somente Gestor"'}>EDIÇÃO AVANÇADA</button>`;
      const print=$('#vxWpPrint'); head.insertBefore(bar,print||null);
      form.dataset.wpModeBarInstalled='1';
    }
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-section="whirlpool"]'))setTimeout(ensureModeBar,120)},true);
  const mo=new MutationObserver(()=>{if($('#vxWpForm'))setTimeout(ensureModeBar,20)});mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureModeBar,500);
})();
