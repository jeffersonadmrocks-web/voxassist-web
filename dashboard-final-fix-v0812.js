/* VoxAssist V0.8.12 — navegação final e pirâmides do Dashboard */
(function(){
  const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  function clickByText(root,text,fn){
    [...root.querySelectorAll('span,a,button,.vx-a-kpi')].forEach(el=>{
      if(norm(el.textContent).includes(norm(text))){el.style.cursor='pointer';el.onclick=e=>{e.preventDefault();e.stopPropagation();fn();};}
    });
  }
  function go(view){try{return window.render?.(view)}catch(e){console.error(e)}}
  function apply(){
    const root=document.querySelector('.vx-approved');if(!root)return;
    const cards=[...root.querySelectorAll('.vx-a-kpi')];
    const routes=[
      ['OS ATIVAS','os'],['AGUARDANDO ANALISE','os'],['AGUARDANDO APROVACAO','os'],['EM CONSERTO','oficina'],['PRONTOS PARA ENTREGA','os'],['ORCAMENTOS','financeiro'],['ENTREGUES','os']
    ];
    cards.forEach(c=>{const t=norm(c.textContent);const r=routes.find(([k])=>t.includes(k));if(r)c.onclick=()=>go(r[1]);});
    clickByText(root,'OPORTUNIDADES DO DIA',()=>go('dashboard'));
    clickByText(root,'CASOS DE ATENCAO',()=>go('agenda'));
    clickByText(root,'AGENDA DE HOJE',()=>go('agenda'));
    clickByText(root,'MINHAS TAREFAS',()=>go('agenda'));
    clickByText(root,'PEDIDOS DE PECAS',()=>go('estoque'));
    clickByText(root,'FEED EM TEMPO REAL',()=>go('dashboard'));
    clickByText(root,'GESTAO POR EXCECAO',()=>go('dashboard'));
    clickByText(root,'PRODUTIVIDADE DO MES',()=>go('relatorios'));
    clickByText(root,'METAS E BONIFICACAO',()=>go('dashboard'));
    clickByText(root,'RESUMO FINANCEIRO',()=>go('financeiro'));
    [...root.querySelectorAll('.vx-a-pyr .vx-a-band')].forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopPropagation();go('os');};});
  }
  const obs=new MutationObserver(()=>{if(document.querySelector('.vx-approved'))apply();});
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(apply,250);
})();
