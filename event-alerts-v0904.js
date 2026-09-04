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
  let watermark=new Date().toISOString(); // nunca alerta sobre histórico antigo
  let myGroupIds=null; // cache -- carregado uma vez, null=ainda não carregado
  let timer=null;

  function norm(v){return String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();}

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

  async function poll(){
    try{
      const myId=window.state?.session?.user?.id;
      const role=norm(window.state?.profile?.role);
      if(!myId||!role||typeof window.api!=='function')return;
      const rows=await window.api(`os_status_history?changed_at=gt.${encodeURIComponent(watermark)}&select=*,service_orders(os_number,store_id,technician_id,service_group_id)&order=changed_at.asc&limit=50`).catch(()=>[]);
      if(!rows.length)return;
      watermark=rows[rows.length-1].changed_at;
      for(const h of rows){
        const alert=await relevantAlert(h,{myId,role});
        if(alert)alertCard(alert.text,alert.osId);
      }
    }catch(_e){/* alerta nunca pode travar nada da tela -- silencioso */}
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
