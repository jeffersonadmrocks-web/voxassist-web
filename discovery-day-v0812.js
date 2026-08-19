/* VoxAssist V0.8.12 — Descoberta do Dia: informação curta + saber mais */
(function(){
  const current={
    title:'Descoberta do Dia',
    quote:'A mente que se abre a uma nova ideia jamais voltará ao seu tamanho original.',
    author:'Albert Einstein',
    category:'Inspiração',
    short:'A ideia central é simples: aprender algo novo muda a forma como enxergamos problemas, possibilidades e decisões. Pequenas descobertas diárias acumulam repertório e melhoram nossa capacidade de pensar.',
    more:'Albert Einstein foi um dos físicos mais influentes do século XX. A frase reforça o valor da curiosidade e do aprendizado contínuo: quando incorporamos uma nova ideia, passamos a observar o mundo com mais referências. No trabalho, isso também vale para atendimento, diagnóstico, organização e tomada de decisão. O objetivo da Descoberta do Dia é exatamente criar essa pequena faísca de conhecimento, de forma leve e rápida.'
  };
  function modal(mode){
    document.querySelector('#vxDiscoveryModal')?.remove();
    const isMore=mode==='more';
    const box=document.createElement('div');
    box.id='vxDiscoveryModal';
    box.className='vx-discovery-modal-bg';
    box.innerHTML=`<div class="vx-discovery-modal" role="dialog" aria-modal="true"><button class="vx-discovery-close" aria-label="Fechar">×</button><div class="vx-discovery-kicker">💡 DESCOBERTA DO DIA</div><h3>${isMore?'Quero saber mais':'Informação curta'}</h3><blockquote>“${current.quote}”</blockquote><div class="vx-discovery-author">— ${current.author} · ${current.category}</div><p>${isMore?current.more:current.short}</p>${!isMore?'<button class="vx-discovery-more">Quero saber mais →</button>':''}</div>`;
    document.body.appendChild(box);
    box.querySelector('.vx-discovery-close').onclick=()=>box.remove();
    box.onclick=e=>{if(e.target===box)box.remove();};
    box.querySelector('.vx-discovery-more')?.addEventListener('click',()=>modal('more'));
    try{const uid=state?.profile?.id||state?.session?.user?.id||'local';localStorage.setItem(`vx_discovery_${isMore?'more':'short'}_${uid}_${new Date().toISOString().slice(0,10)}`,'1');}catch(e){}
  }
  function enhance(){
    const card=document.querySelector('.vx-a-discovery');if(!card)return;
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