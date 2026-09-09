/* VoxAssist V0.8.13 — Permissões por empresa + cabeçalho estável */
(function(){
  const E=window.esc||((v='')=>String(v??''));

  function doLogout(){
    Promise.resolve().then(async()=>{try{await auth('logout',{})}catch{};try{clearSession()}catch{};try{localStorage.removeItem('vox_session')}catch{};try{loginScreen()}catch{location.reload()}});
  }

  // C4 (Matriz Mestra de Configurações, resolvido 2026-09-09): esta
  // função tinha seu próprio seletor de empresa ativa
  // (#vxHeaderCompanyWrap/#vxHeaderCompany), concorrente com outros
  // 3. company-selector-singleton-v0813.js é o único que de fato
  // aparece pro usuário -- removido o seletor duplicado daqui,
  // mantendo só o botão #vxTopLogout (responsabilidade própria deste
  // arquivo, fora do escopo do C4).
  async function ensureHeader(){
    if(!state?.session)return;
    const header=document.querySelector('header'); if(!header)return;
    // Remove qualquer logout legado/lateral e preserva apenas o oficial do topo.
    document.querySelectorAll('#vxVisibleLogout,.vx-visible-logout,.sidebar #logout,.side #logout,aside #logout').forEach(x=>x.remove());
    let actions=header.querySelector('.vx-header-actions');
    if(!actions){actions=document.createElement('div');actions.className='vx-header-actions';header.appendChild(actions)}
    let logout=actions.querySelector('#vxTopLogout');
    if(!logout){logout=document.createElement('button');logout.id='vxTopLogout';logout.type='button';logout.className='secondary';logout.textContent='Sair';logout.title='Encerrar sessão';logout.onclick=doLogout;actions.appendChild(logout)}
  }

  // C5 (Matriz Mestra de Configurações, resolvido 2026-09-09):
  // fetchManagedCompanies/fetchUser/permissionCard/openPermissions e o
  // interceptador de clique em [data-user-manage] foram removidos --
  // essa era, na prática, a tela que "vencia" a concorrência de 3
  // implementações de "Alterar Usuário" (capturava o clique antes de
  // qualquer outro handler). A capacidade real que só existia aqui
  // ("Empresas liberadas") foi portada pra user-access-management-
  // v0813.js (tela canônica agora), reaproveitando a mesma Edge
  // Function voxassist-manage-user -- nenhuma função perdida.

  const style=document.createElement('style');style.textContent=`
    .vx-header-actions{margin-left:auto;display:flex;align-items:center;gap:10px;padding-right:10px}.vx-header-company{display:flex;flex-direction:column;gap:2px;min-width:210px}.vx-header-company small{font-size:8px;color:#60758c;font-weight:800}.vx-header-company select{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 10px;font-size:11px;font-weight:700;color:#17324e}#vxTopLogout{height:36px;padding:0 16px;white-space:nowrap}
    .vx-perm-page{position:fixed;inset:0;z-index:60000;background:#f4f7fa;overflow:auto;padding:18px 22px 90px;color:#172b3f}.vx-perm-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.vx-perm-top>div:first-child{display:flex;align-items:center;gap:12px}.vx-perm-top h2{margin:0;font-size:22px}.vx-perm-top h2 small{font-weight:600}.vx-perm-top-actions{display:flex;gap:8px}.vx-user-summary{display:grid;grid-template-columns:2fr 1fr 1.2fr 1.4fr;gap:10px;background:#fff;border:1px solid #dbe4ec;border-radius:10px;padding:14px;margin-bottom:12px}.vx-user-summary label{font-size:10px;font-weight:800;color:#496175;display:grid;gap:5px}.vx-user-summary input,.vx-user-summary select{height:38px;border:1px solid #cbd7e2;border-radius:6px;padding:0 9px;background:#fff}.vx-active-toggle{display:flex!important;align-items:center!important;flex-direction:row!important;gap:8px!important}.vx-active-toggle input{width:20px;height:20px}.vx-company-access{display:flex;justify-content:space-between;gap:20px;background:#fff;border:1px solid #dbe4ec;border-radius:10px;padding:14px;margin-bottom:12px}.vx-company-access h3{margin:0 0 3px;font-size:14px}.vx-company-access p{margin:0;color:#718397;font-size:10px}.vx-company-pills{display:flex;flex-wrap:wrap;gap:8px}.vx-company-pills label{cursor:pointer}.vx-company-pills input{display:none}.vx-company-pills span{display:block;border:1px solid #cbd7e2;border-radius:18px;padding:8px 13px;font-size:10px;font-weight:800;background:#fff}.vx-company-pills input:checked+span{background:#e9f3ff;border-color:#2c7be5;color:#1557a5}.vx-perm-company-context{display:flex;gap:8px;align-items:center;margin:14px 2px 8px}.vx-perm-company-context span{background:#eaf7ef;color:#17643c;border-radius:14px;padding:5px 10px;font-size:10px;font-weight:800}.vx-perm-grid{display:grid;grid-template-columns:repeat(3,minmax(280px,1fr));gap:12px}.vx-perm-card{background:#fff;border:1px solid #dbe4ec;border-radius:9px;overflow:hidden}.vx-perm-card>header{background:#0d2536;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center}.vx-perm-card>header h3{margin:0;font-size:17px;font-weight:600}.vx-perm-card>header span{font-size:8px;background:#8d2c2c;padding:4px 6px;border-radius:4px}.vx-perm-card.critical{border-color:#e7bcbc}.vx-perm-list label{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #edf1f4;font-size:11px;cursor:pointer}.vx-perm-list label:last-child{border-bottom:0}.vx-perm-list input{width:18px;height:18px}.vx-perm-footer{position:fixed;left:0;right:0;bottom:0;z-index:60001;background:#fff;border-top:1px solid #dbe4ec;padding:12px 22px;display:flex;justify-content:space-between;box-shadow:0 -4px 16px rgba(17,40,64,.08)}.vx-perm-footer>div{display:flex;gap:8px}.danger{color:#a72828!important;border-color:#e5b8b8!important}@media(max-width:1100px){.vx-perm-grid{grid-template-columns:repeat(2,minmax(260px,1fr))}.vx-user-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.vx-perm-page{padding:12px 12px 100px}.vx-perm-top{align-items:flex-start;flex-direction:column}.vx-perm-top-actions{flex-wrap:wrap}.vx-user-summary,.vx-perm-grid{grid-template-columns:1fr}.vx-company-access{flex-direction:column}.vx-header-company{min-width:150px}}
  `;document.head.appendChild(style);

  const observer=new MutationObserver(()=>{clearTimeout(window.__vxHeaderTimer);window.__vxHeaderTimer=setTimeout(ensureHeader,80)});observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureHeader,100));setTimeout(ensureHeader,300);
})();