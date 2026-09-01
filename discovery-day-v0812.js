/* VoxAssist — Descoberta do Dia V2: rotativa, local e sem acesso a dados operacionais */
(function(){
  const items=[
    {quote:'Grandes resultados nascem de pequenas melhorias repetidas.',author:'VoxAssist',category:'Gestão',short:'Melhorias pequenas e frequentes ajudam a reduzir gargalos sem exigir mudanças bruscas na operação.',more:'Use esta ideia para observar um ponto específico do processo por vez: fila, prazo, retorno ao cliente, peça ou agenda. A Descoberta do Dia é educativa e não consulta, altera ou envia dados operacionais.'},
    {quote:'O que não é acompanhado tende a virar urgência.',author:'VoxAssist',category:'Operação',short:'Acompanhar exceções cedo ajuda a agir antes que um atraso se transforme em problema para o cliente.',more:'No VoxAssist, alertas operacionais devem ser sustentados por dados reais. Esta área de descoberta é apenas educativa e nunca substitui um alerta do Radar de Gestão.'},
    {quote:'Prioridade é escolher o que merece atenção agora.',author:'VoxAssist',category:'Produtividade',short:'Prazo, impacto e risco ajudam a decidir o que vem primeiro.',more:'Indicadores mostram o cenário; o futuro Radar aponta exceções; Minha Jornada organiza responsabilidades. A descoberta diária complementa a rotina com uma reflexão curta.'},
    {quote:'Um processo confiável deixa rastros que podem ser conferidos.',author:'VoxAssist',category:'Segurança',short:'Rastreabilidade ajuda a entender quem fez o quê, quando e por qual motivo.',more:'Segurança depende de permissões no servidor, RLS, auditoria e histórico de alterações. A evolução do VoxAssist deve preservar esse princípio em qualquer automação ou camada de IA.'},
    {quote:'Dados ajudam mais quando levam a uma decisão clara.',author:'VoxAssist',category:'Inteligência',short:'Um indicador só tem valor quando ajuda a identificar risco, oportunidade ou próxima ação.',more:'Por isso o Dashboard Inteligente deve evitar números decorativos. Quando existir um desvio, o usuário deverá conseguir abrir os registros que sustentam a informação.'},
    {quote:'Resolver a causa é mais estável do que acumular correções.',author:'VoxAssist',category:'Melhoria contínua',short:'Consolidar a causa-raiz reduz regressões e aumenta a previsibilidade.',more:'Este princípio orienta a estabilização atual do VoxAssist: mudanças pequenas, fontes claras, regras determinísticas e validação no Preview antes de avançar.'},
    {quote:'Capacidade ociosa também pode ser uma oportunidade.',author:'VoxAssist',category:'Planejamento',short:'Agenda, carga dos técnicos e fila de serviços precisam ser analisadas em conjunto.',more:'Uma agenda vazia isoladamente não significa problema. O contexto importa; capacidade, demanda, região e prioridade devem ser cruzados antes de qualquer recomendação.'}
  ];
  const dayIndex=()=>{const d=new Date();const start=new Date(d.getFullYear(),0,0);return Math.floor((d-start)/86400000)%items.length;};
  const current=()=>items[dayIndex()];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function modal(mode){
    const item=current();
    document.querySelector('#vxDiscoveryModal')?.remove();
    const isMore=mode==='more';
    const box=document.createElement('div');
    box.id='vxDiscoveryModal';
    box.className='vx-discovery-modal-bg';
    box.innerHTML=`<div class="vx-discovery-modal" role="dialog" aria-modal="true"><button class="vx-discovery-close" aria-label="Fechar">×</button><div class="vx-discovery-kicker">💡 DESCOBERTA DO DIA</div><h3>${isMore?'Quero saber mais':'Informação curta'}</h3><blockquote>“${esc(item.quote)}”</blockquote><div class="vx-discovery-author">— ${esc(item.author)} · ${esc(item.category)}</div><p>${esc(isMore?item.more:item.short)}</p>${!isMore?'<button class="vx-discovery-more">Quero saber mais →</button>':''}<p style="margin-top:10px;font-size:11px;color:#718399">Conteúdo educativo local. Não consulta, altera ou envia dados operacionais.</p></div>`;
    document.body.appendChild(box);
    box.querySelector('.vx-discovery-close').onclick=()=>box.remove();
    box.onclick=e=>{if(e.target===box)box.remove();};
    box.querySelector('.vx-discovery-more')?.addEventListener('click',()=>modal('more'));
    try{const uid=state?.profile?.id||state?.session?.user?.id||'local';localStorage.setItem(`vx_discovery_${isMore?'more':'short'}_${uid}_${new Date().toISOString().slice(0,10)}`,'1');}catch(e){}
  }

  function enhance(){
    const card=document.querySelector('.vx-a-discovery');if(!card)return;
    const item=current();
    const all=[...card.querySelectorAll('*')];
    const quote=all.find(x=>/A mente que se abre/i.test(x.textContent||''));if(quote)quote.textContent=`“${item.quote}”`;
    const author=all.find(x=>/Albert Einstein/i.test(x.textContent||''));if(author)author.textContent=`— ${item.author} · ${item.category}`;
    const candidates=[...card.querySelectorAll('button,a,strong,span,div')];
    const short=candidates.find(x=>/INFORMAÇÃO CURTA/i.test((x.textContent||'').trim()) && x.children.length===0);
    const more=candidates.find(x=>/QUERO SABER MAIS/i.test((x.textContent||'').trim()) && x.children.length===0);
    if(short){short.classList.add('vx-discovery-link');short.setAttribute('role','button');short.tabIndex=0;short.onclick=e=>{e.preventDefault();modal('short');};short.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();modal('short');}};}
    if(more){more.classList.add('vx-discovery-link');more.setAttribute('role','button');more.tabIndex=0;more.onclick=e=>{e.preventDefault();modal('more');};more.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();modal('more');}};}
  }

  document.addEventListener('click',e=>{
    const card=e.target.closest('.vx-a-discovery');if(!card)return;
    const txt=(e.target.textContent||'').trim();
    if(/QUERO SABER MAIS/i.test(txt)){e.preventDefault();e.stopPropagation();modal('more');}
    else if(/INFORMAÇÃO CURTA/i.test(txt)){e.preventDefault();e.stopPropagation();modal('short');}
  },true);

  const old=window.renderDashboard;
  if(typeof old==='function')window.renderDashboard=async function(){const r=await old.apply(this,arguments);setTimeout(enhance,0);return r;};
  setTimeout(enhance,500);
  window.vxDiscoveryOpen=modal;
})();