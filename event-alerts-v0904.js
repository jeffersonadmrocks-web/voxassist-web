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

  // Variante do toast() de app.js (não alterado -- usado em todo lugar,
  // risco desnecessário mexer nele) com clique pra abrir a OS, tempo
  // maior (6s, não 3.2s) e empilhamento com deslocamento vertical de
  // verdade (dois alertas ao mesmo tempo hoje ficam um em cima do
  // outro; aqui cada um ganha sua própria posição).
  function alertToast(msg,osId){
    const stackIndex=document.querySelectorAll('.toast.vx-alert-toast').length;
    const x=document.createElement('div');
    x.className='toast vx-alert-toast';
    x.style.bottom=(22+stackIndex*64)+'px';
    x.style.cursor=osId?'pointer':'default';
    x.textContent=msg;
    if(osId)x.onclick=()=>{x.remove();(window.render||render)('os:'+osId)};
    document.body.appendChild(x);
    setTimeout(()=>x.remove(),6000);
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
        if(alert)alertToast(alert.text,alert.osId);
      }
    }catch(_e){/* alerta nunca pode travar nada da tela -- silencioso */}
  }

  function start(){if(timer)return;timer=setInterval(poll,POLL_MS);}
  start();
})();
