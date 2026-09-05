/* VoxAssist Web V0.9.04 — Alerta de eventos pra atendente/técnico.
   Achado do usuário em 2026-09-04: o Feed em Tempo Real do Dashboard é
   bom, mas "fica apagadinho" -- ninguém garante que o atendente/
   técnico certo VÊ o evento na hora. Sem infraestrutura de tempo real
   no app (confirmado: sem Supabase Realtime, sem tabela de
   notificação, sem sino -- busca ampla nesta sessão) -- reaproveita o
   mesmo padrão de polling já estabelecido (2s-30s conforme a tela,
   ver presence-heartbeat-v1.js) e a MESMA fonte de dados do Feed
   (os_status_history), sem duplicar nenhuma lógica de texto/regra.
   Roda global (não só no Dashboard) -- sobrevive em qualquer tela,
   igual ao heartbeat de presença. */
(function(){
  const POLL_MS=20000;
  const WATERMARK_KEY='vxAlertWatermark_';
  // Achado do usuário em 2026-09-05: "Solicitar peça" não gerava
  // NENHUM alerta pra quem recebe -- pedidos de peça vivem numa tabela
  // à parte (parts_requests), sem relação com os_status_history, e o
  // Dashboard não tem atualização automática dos próprios cartões
  // (só recarrega ao dar F5 ou sair/voltar da tela de Início) -- quem
  // não estivesse olhando o card na hora nunca saberia. Watermark
  // separado (chave própria), mesmo padrão de persistência do de cima.
  const PARTS_WATERMARK_KEY='vxAlertPartsWatermark_';
  // Achado do usuário em 2026-09-04 (2ª rodada de teste, ainda sem
  // aparecer): o watermark em memória reiniciava pra "agora" TODA VEZ
  // que a página recarregava -- então recarregar a tela da atendente
  // pra conferir um alerta já perdia justamente a mudança que se
  // queria ver. Agora persiste por usuário (localStorage, o navegador/
  // aparelho de quem loga) -- ao voltar a abrir/recarregar, retoma de
  // onde parou em vez de reiniciar em "agora". Só na PRIMEIRA vez que
  // este arquivo roda pra um usuário (sem nada salvo ainda) é que cai
  // em "agora" -- continua nunca inundando a tela com meses de
  // histórico antigo de teste.
  let watermark=null; // null = ainda não carregado (carrega no 1º poll, quando já se sabe o myId)
  let partsWatermark=null; // idem, pra pollParts()
  let myGroupIds=null; // cache -- carregado uma vez, null=ainda não carregado
  let timer=null;

  function norm(v){return String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();}
  // 1ª vez pra este usuário (nada salvo ainda): parte de 3h atrás, não
  // de "agora" -- cobre testes/eventos bem recentes sem arriscar
  // inundar com histórico antigo de dias.
  const FIRST_TIME_LOOKBACK_MS=3*60*60*1000;
  function loadWatermark(key,myId){try{return localStorage.getItem(key+myId)||new Date(Date.now()-FIRST_TIME_LOOKBACK_MS).toISOString();}catch(_e){return new Date(Date.now()-FIRST_TIME_LOOKBACK_MS).toISOString();}}
  function saveWatermark(key,myId,ts){try{localStorage.setItem(key+myId,ts);}catch(_e){}}

  async function myGroups(myId){
    if(myGroupIds)return myGroupIds;
    myGroupIds=new Set((await window.api(`service_group_technicians?technician_id=eq.${myId}&select=service_group_id`).catch(()=>[])).map(r=>String(r.service_group_id)));
    return myGroupIds;
  }

  // Mesma classificação de runtime/dashboard-canonical-v1.js's feedText
  // -- não duplica o TEXTO (cada alerta tem sua própria mensagem, mais
  // direta pro contexto de notificação), só a REGRA de "o que virou o
  // quê", pra nunca discordar do Feed.
  async function relevantAlert(h,ctx){
    const so=h.service_orders||{};
    const num=so.os_number||'—';
    const ns=norm(h.new_status);
    const ps=norm(h.previous_status);
    if(!h.previous_status){
      // Nova OS criada -- alerta só o(s) técnico(s) do grupo de atendimento da OS.
      if(!so.service_group_id)return null;
      if(ctx.role!=='TECNICO')return null;
      const groups=await myGroups(ctx.myId);
      if(!groups.has(String(so.service_group_id)))return null;
      return {text:`📋 Nova OS #${num} no seu grupo de atendimento`,osId:h.service_order_id};
    }
    if(ns==='AGUARDANDO APROVACAO'){
      if(ctx.role!=='ATENDENTE'&&ctx.role!=='GESTOR')return null;
      return {text:`💰 Orçamento gerado — OS #${num}, pronta pra dar seguimento`,osId:h.service_order_id};
    }
    if(ps==='AGUARDANDO APROVACAO'&&ns==='AGUARDANDO CONSERTO'){
      if(!so.technician_id||String(so.technician_id)!==String(ctx.myId))return null;
      return {text:`✔ Orçamento aprovado — OS #${num} liberada pra conserto`,osId:h.service_order_id};
    }
    if(ns==='PRONTO PARA ENTREGA'){
      if(ctx.role!=='ATENDENTE'&&ctx.role!=='GESTOR')return null;
      return {text:`📦 Aparelho pronto — OS #${num} aguardando retirada`,osId:h.service_order_id};
    }
    return null;
  }

  // Achado do usuário em 2026-09-04: um toast que some sozinho (mesmo
  // com 6s) não garante que o operador viu -- pediu explicitamente que
  // o alerta FIQUE na tela até ele mesmo fechar. Por isso não é mais
  // uma variante do toast() de app.js (que continua intocado): é um
  // cartão persistente, empilhado num container próprio (flex, sem
  // cálculo manual de posição -- ao fechar um, os outros reacomodam
  // sozinhos), com botão de fechar (✕) e, quando tem OS vinculada, um
  // botão "Abrir OS →" -- os dois removem o cartão; só o de abrir
  // também navega.
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function alertStack(){
    let s=document.getElementById('vxAlertStack');
    if(!s){s=document.createElement('div');s.id='vxAlertStack';document.body.appendChild(s);}
    return s;
  }
  function alertCard(msg,osId){
    const stack=alertStack();
    const card=document.createElement('div');
    card.className='vx-alert-card';
    card.innerHTML=`<span class="vx-alert-card-msg">${esc(msg)}</span><div class="vx-alert-card-actions">${osId?'<button type="button" data-open>Abrir OS →</button>':''}<button type="button" data-dismiss aria-label="Fechar">✕</button></div>`;
    stack.prepend(card);
    card.querySelector('[data-dismiss]').onclick=()=>card.remove();
    // Achado do usuário em 2026-09-04 (correção de interpretação: o
    // pedido era abrir numa aba do PRÓPRIO SISTEMA -- o app já tem seu
    // próprio sistema de abas, state.openTabs/renderTabs em app.js --
    // não uma nova aba do NAVEGADOR, que foi o que a versão anterior
    // fez por engano). Só adiciona a OS como uma aba nova na barra de
    // abas do app, SEM trocar pra ela -- a tela atual do operador
    // continua exatamente como estava; ele abre a aba nova quando
    // quiser, clicando nela.
    if(osId)card.querySelector('[data-open]').onclick=()=>{
      card.remove();
      const view='os:'+osId;
      if(typeof state!=='undefined'&&!state.openTabs.includes(view))state.openTabs.push(view);
      if(typeof renderTabs==='function')renderTabs();
    };
  }

  // Achado do usuário em 2026-09-04 (causa real, achada pelos logs de
  // diagnóstico -- 4ª rodada de teste): `state` em app.js é `const
  // state={...}` no topo do arquivo. Uma declaração const/let no
  // escopo global de um <script> clássico NUNCA vira propriedade de
  // `window` (diferente de `function`, que vira) -- por isso
  // `window.state` sempre foi `undefined` aqui, mesmo com `state`
  // (sem "window.") funcionando normalmente em TODO o resto do app
  // (os-detail-v0812.js, dashboard-canonical-v1.js etc. só usam
  // `state`, nunca `window.state`). O poll abortava silenciosamente
  // em 100% das vezes desde o início -- corrigido usando `state`
  // direto, igual a todo o resto do código.
  async function poll(){
    try{
      const myId=state?.session?.user?.id;
      const role=norm(state?.profile?.role);
      if(!myId||!role||typeof window.api!=='function')return;
      if(watermark===null)watermark=loadWatermark(WATERMARK_KEY,myId);
      const rows=await window.api(`os_status_history?changed_at=gt.${encodeURIComponent(watermark)}&select=*,service_orders(os_number,store_id,technician_id,service_group_id)&order=changed_at.asc&limit=50`).catch(()=>[]);
      if(!rows.length)return;
      watermark=rows[rows.length-1].changed_at;
      saveWatermark(WATERMARK_KEY,myId,watermark);
      for(const h of rows){
        const alert=await relevantAlert(h,{myId,role});
        if(alert)alertCard(alert.text,alert.osId);
      }
    }catch(_e){/* alerta nunca pode travar nada da tela -- silencioso */}
  }

  // Solicitação de peça -- tabela própria (parts_requests), sem
  // relação com os_status_history, por isso é um poll separado com
  // watermark próprio. Alerta o destinatário específico
  // (assigned_to) quando marcado; sem destinatário, alerta
  // ATENDENTE/GESTOR (mesmo público padrão que já vê o pedido "sem
  // dono" no Dashboard/roleVisible). Nunca alerta quem criou o
  // próprio pedido.
  // Logs de diagnóstico temporários (achado do usuário em 2026-09-05:
  // 1º teste real com destinatário certo -- assigned_to batendo com
  // quem devia ver -- não alertou; preciso enxergar exatamente onde
  // para, igual fiz pro poll() de status).
  async function pollParts(){
    try{
      const myId=state?.session?.user?.id;
      const role=norm(state?.profile?.role);
      if(!myId||!role||typeof window.api!=='function'){
        console.log('[event-alerts:parts] abortado -- myId:',myId,'role:',role);
        return;
      }
      if(partsWatermark===null)partsWatermark=loadWatermark(PARTS_WATERMARK_KEY,myId);
      console.log('[event-alerts:parts] verificando desde',partsWatermark,'-- myId:',myId,'role:',role);
      const rows=await window.api(`parts_requests?created_at=gt.${encodeURIComponent(partsWatermark)}&select=*,service_orders(os_number)&order=created_at.asc&limit=50`).catch(err=>{console.error('[event-alerts:parts] falha na busca:',err);return[];});
      console.log('[event-alerts:parts] linhas retornadas:',rows.length,rows);
      if(!rows.length)return;
      partsWatermark=rows[rows.length-1].created_at;
      saveWatermark(PARTS_WATERMARK_KEY,myId,partsWatermark);
      for(const p of rows){
        if(String(p.requested_by)===String(myId)){console.log('[event-alerts:parts] pulado (sou o autor):',p.id);continue;}
        const relevant=p.assigned_to?String(p.assigned_to)===String(myId):(role==='ATENDENTE'||role==='GESTOR');
        console.log('[event-alerts:parts] pedido',p.id,'assigned_to:',p.assigned_to,'relevante pra mim:',relevant);
        if(!relevant)continue;
        const num=p.service_orders?.os_number;
        alertCard(`🔧 Novo pedido de peça — "${p.description||'peça'}"${num?` (OS #${num})`:''}`,p.service_order_id||null);
      }
    }catch(_e){console.error('[event-alerts:parts] erro inesperado:',_e);}
  }

  // Achado do usuário em 2026-09-04: com a aba em segundo plano, o
  // navegador reduz a frequência real do setInterval (throttling),
  // podendo levar bem mais que POLL_MS pra disparar. Rechecar na hora
  // em que a aba volta a ficar visível cobre exatamente o caso mais
  // comum de teste -- alguém troca de aba, faz a mudança em outro
  // lugar, volta -- sem precisar reduzir o intervalo geral.
  function pollAll(){poll();pollParts();}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollAll();});

  function start(){if(timer)return;timer=setInterval(pollAll,POLL_MS);}
  start();
})();
