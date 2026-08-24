/* VoxAssist Web V0.8.13 — módulo Electrolux / Relatórios isolado */
(function(){
  const VIEW='electrolux';
  const CONFIG_KEY='voxassist_electrolux_reports_url';
  const SOURCE_REPO='https://github.com/jeffersonadmrocks-web/electrolux-voxanalytics';

  try{ if(typeof navMap!=='undefined') navMap[VIEW]='Electrolux'; }catch(_e){}

  function installStyle(){
    if(document.getElementById('vxElectroluxReportsStyle')) return;
    const s=document.createElement('style');
    s.id='vxElectroluxReportsStyle';
    s.textContent=`
      .nav[data-view="electrolux"]{border-left:3px solid #1b5fa7}
      .vx-elx-page{padding:18px 22px 30px;display:grid;gap:16px}
      .vx-elx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#102a43,#174f86);color:#fff;border-radius:14px;padding:20px 22px;box-shadow:0 8px 24px rgba(15,45,76,.16)}
      .vx-elx-head h2{margin:2px 0 6px;font-size:24px}.vx-elx-head p{margin:0;opacity:.9}.vx-elx-badge{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 11px;background:rgba(255,255,255,.13);font-size:12px;font-weight:700;white-space:nowrap}
      .vx-elx-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.vx-elx-card{background:#fff;border:1px solid #dfe7ef;border-radius:12px;padding:15px;min-height:118px}.vx-elx-card b{display:block;font-size:15px;margin-bottom:6px;color:#17324d}.vx-elx-card p{font-size:13px;color:#65788b;line-height:1.45;margin:0}
      .vx-elx-panel{background:#fff;border:1px solid #dfe7ef;border-radius:12px;overflow:hidden}.vx-elx-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e8eef4}.vx-elx-toolbar strong{color:#17324d}.vx-elx-actions{display:flex;gap:8px;flex-wrap:wrap}.vx-elx-actions button,.vx-elx-actions a{font:inherit;border:1px solid #cbd8e5;background:#fff;color:#174f86;padding:8px 11px;border-radius:8px;text-decoration:none;cursor:pointer}.vx-elx-actions .primary{background:#174f86;color:#fff;border-color:#174f86}
      .vx-elx-frame{width:100%;height:68vh;border:0;background:#f4f7fa}.vx-elx-empty{padding:34px 24px;text-align:center;background:#f7f9fb}.vx-elx-empty h3{margin:0 0 8px;color:#17324d}.vx-elx-empty p{max-width:720px;margin:0 auto 18px;color:#66798c;line-height:1.5}.vx-elx-note{font-size:12px;color:#64778a;background:#eef4f8;border-radius:9px;padding:10px 12px}
      @media(max-width:980px){.vx-elx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-elx-head{flex-direction:column}.vx-elx-frame{height:72vh}}@media(max-width:620px){.vx-elx-grid{grid-template-columns:1fr}.vx-elx-page{padding:12px}.vx-elx-toolbar{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(s);
  }

  function ensureNav(){
    const side=document.querySelector('.sidebar');
    if(!side || side.querySelector('.nav[data-view="electrolux"]')) return;
    const btn=document.createElement('button');
    btn.className='nav';btn.dataset.view=VIEW;btn.textContent='Electrolux';
    const configBtn=side.querySelector('.nav[data-view="usuarios"]');
    if(configBtn) side.insertBefore(btn,configBtn); else side.appendChild(btn);
    btn.onclick=()=>window.render(VIEW);
  }

  function reportUrl(){return (localStorage.getItem(CONFIG_KEY)||'').trim();}
  function safeUrl(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}}

  function renderPage(){
    installStyle();ensureNav();
    try{state.view=VIEW;if(typeof addTab==='function')addTab(VIEW,'Electrolux');}catch(_e){}
    const title=document.querySelector('#title');if(title)title.textContent='Electrolux • Relatórios';
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===VIEW));
    try{if(typeof renderTabs==='function')renderTabs('Electrolux');}catch(_e){}
    const app=document.querySelector('#app');if(!app)return;
    const url=safeUrl(reportUrl());
    app.innerHTML=`<div class="vx-elx-page">
      <div class="vx-elx-head"><div><small>MÓDULO INDEPENDENTE</small><h2>Electrolux • Relatórios</h2><p>Área separada do banco operacional do VoxAssist. Nenhum cliente, OS, estoque, financeiro ou agenda do VoxAssist é combinado com os dados Electrolux nesta etapa.</p></div><span class="vx-elx-badge">🔒 DADOS ISOLADOS</span></div>
      <div class="vx-elx-grid">
        <div class="vx-elx-card"><b>Visão de SVOs</b><p>Estrutura preparada para consultar o painel de ordens e status reais do SAE Electrolux.</p></div>
        <div class="vx-elx-card"><b>Indicadores</b><p>Área dedicada a SVOs abertas, atrasos, aging e RCT sem contaminar indicadores do VoxAssist.</p></div>
        <div class="vx-elx-card"><b>Relatórios</b><p>Consulta e análise do VoxAnalytics preservando sua aplicação e backend próprios.</p></div>
        <div class="vx-elx-card"><b>Integração controlada</b><p>Qualquer futura troca de dados com o VoxAssist dependerá de uma integração explícita e separada.</p></div>
      </div>
      <div class="vx-elx-panel"><div class="vx-elx-toolbar"><strong>Painel VoxAnalytics</strong><div class="vx-elx-actions">${url?`<button class="primary" id="vxElxReload">Atualizar painel</button><a href="${url}" target="_blank" rel="noopener">Abrir em nova janela</a>`:`<a class="primary" href="${SOURCE_REPO}" target="_blank" rel="noopener">Projeto Electrolux</a>`}</div></div>
      ${url?`<iframe class="vx-elx-frame" src="${url}" title="VoxAnalytics Electrolux" referrerpolicy="no-referrer"></iframe>`:`<div class="vx-elx-empty"><h3>Menu publicado e isolamento concluído</h3><p>O VoxAnalytics já está referenciado como aplicação independente. Assim que o dashboard/backend Electrolux possuir um endereço web acessível, ele poderá ser exibido diretamente aqui sem compartilhar tabelas ou dados com o Supabase operacional do VoxAssist.</p><div class="vx-elx-note">Fonte preservada: jeffersonadmrocks-web/electrolux-voxanalytics • nenhuma leitura/gravação no banco do VoxAssist foi adicionada.</div></div>`}
      </div></div>`;
    const reload=document.getElementById('vxElxReload');if(reload)reload.onclick=()=>{const frame=document.querySelector('.vx-elx-frame');if(frame)frame.src=frame.src;};
  }

  const priorRender=window.render;
  window.render=function(view){if(view===VIEW)return renderPage();return priorRender.apply(this,arguments)};

  const mo=new MutationObserver(()=>ensureNav());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  installStyle();ensureNav();setTimeout(ensureNav,250);setTimeout(ensureNav,1000);
})();
