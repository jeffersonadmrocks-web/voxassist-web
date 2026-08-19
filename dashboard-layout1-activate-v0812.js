/* VoxAssist V0.8.12 — ativa o Layout 1 do Dashboard uma única vez após o carregamento */
(function(){
  let ran=false;
  async function activate(){
    if(ran)return;
    if(!window.state||!state.session||state.view!=='dashboard'||typeof window.renderDashboard!=='function'||!document.querySelector('#app'))return;
    ran=true;
    try{await window.renderDashboard();}catch(e){console.error('Falha ao ativar Dashboard Layout 1',e);}
  }
  window.addEventListener('load',()=>setTimeout(activate,250),{once:true});
  setTimeout(activate,800);
})();