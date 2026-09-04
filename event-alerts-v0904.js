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
  let myGroupIds=null; // cache -- carregado uma vez, null=ainda não carregado
  let timer=null;

  function norm(v){return String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();}
  // 1ª vez pra este usuário (nada salvo ainda): parte de 3h atrás, não
  // de "agora" -- cobre testes/eventos bem recentes sem arriscar
  // inundar com histórico antigo de dias.
  const FIRST_TIME_LOOKBACK_MS=3*60*60*1000;
  function loadWatermark(myId){try{return localStorage.getItem(WATERMARK_KEY+myId)||new Date(Date.now()-FIRST_TIME_LOOKBACK_MS).toISOString();}catch(_e){return new Date(Date.now()-FIRST_TIME_LOOKBACK_MS).toISOString();}}
  function saveWatermark(myId,ts){try{localStorage.setItem(WATERMARK_KEY+myId,ts);}catch(_e){}}

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
    if(osId)card.querySelector('[data-open]').onclick=()=>{card.remove();(window.render||render)('os:'+osId)};
  }

  // Achado do usuário em 2026-09-04 (4ª rodada de teste, ainda sem
  // aparecer, mesmo com deploy confirmado e Ctrl+F5 feito): o catch
  // silencioso não deixava ver SE havia algum erro real acontecendo.
  // Logs temporários de diagnóstico (console.log/console.error) --
  // não mudam nenhum comportamento visível, só ajudam a enxergar onde
  // exatamente o fluxo para: sem myId/role, sem linhas retornadas, ou
  // relevantAlert descartando o evento.
  async function poll(){
    try{
      const myId=window.state?.session?.user?.id;
      const role=norm(window.state?.profile?.role);
      if(!myId||!role||typeof window.api!=='function'){
        console.log('[event-alerts] poll abortado -- myId:',myId,'role:',role,'api disponível:',typeof window.api==='function');
        return;
      }
      if(watermark===null)watermark=loadWatermark(myId);
      console.log('[event-alerts] verificando eventos desde',watermark,'-- myId:',myId,'role:',role);
      const rows=await window.api(`os_status_history?changed_at=gt.${encodeURIComponent(watermark)}&select=*,service_orders(os_number,store_id,technician_id,service_group_id)&order=changed_at.asc&limit=50`).catch(err=>{console.error('[event-alerts] falha ao buscar histórico:',err);return[];});
      console.log('[event-alerts] linhas retornadas:',rows.length,rows);
      if(!rows.length)return;
      watermark=rows[rows.length-1].changed_at;
      saveWatermark(myId,watermark);
      for(const h of rows){
        const alert=await relevantAlert(h,{myId,role});
        console.log('[event-alerts] evento',h.id,'status',h.previous_status,'->',h.new_status,'-- alerta:',alert);
        if(alert)alertCard(alert.text,alert.osId);
      }
    }catch(_e){console.error('[event-alerts] erro inesperado no poll:',_e);}
  }

  // Achado do usuário em 2026-09-04: com a aba em segundo plano, o
  // navegador reduz a frequência real do setInterval (throttling),
  // podendo levar bem mais que POLL_MS pra disparar. Rechecar na hora
  // em que a aba volta a ficar visível cobre exatamente o caso mais
  // comum de teste -- alguém troca de aba, faz a mudança em outro
  // lugar, volta -- sem precisar reduzir o intervalo geral.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});

  function start(){if(timer)return;timer=setInterval(poll,POLL_MS);}
  start();
})();
