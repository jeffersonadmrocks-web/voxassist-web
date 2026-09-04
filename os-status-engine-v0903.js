/* VoxAssist Web V0.9.03 — motor único de evolução automática da situação
   da OS (achado do usuário 2026-09-03: a situação não pode depender de
   alteração manual). Toda a DECISÃO vive em advance_service_order_status
   (SQL, supabase/migrations/20260903010000_service_order_status_automation.sql)
   -- este arquivo só CHAMA a RPC depois de um evento operacional real já
   ter sido salvo com sucesso. Nunca decide sozinho, nunca duplica a
   lógica de transição em JS -- um único motor, no banco. */
(function(){
  const STATUS_LABEL={
    'AGUARDANDO ANALISE':'Aguardando Análise','AGUARDANDO APROVACAO':'Aguardando Aprovação',
    'AGUARDANDO CONSERTO':'Aguardando Conserto','EM CONSERTO':'Em Conserto','PRONTO PARA ENTREGA':'Pronto para Entrega',
    'ORCAMENTO RECUSADO':'Orçamento Recusado','ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA':'Orçamento Recusado / Disponível para Retirada',
    'ORCAMENTO RECUSADO ENCERRADO':'Orçamento Recusado / Encerrado','FINALIZADA':'Finalizada','CANCELADA':'Cancelada',
  };
  const labelOf=s=>STATUS_LABEL[String(s||'').replaceAll('_',' ')]||String(s||'').replaceAll('_',' ');
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Achado do usuário em 2026-09-04 (OS #03I26G57): o modal "falta
  // preencher" fazia sentido pra AGUARDANDO ANALISE (técnico/defeito/
  // serviço/valor são coisas que o ATENDENTE/TÉCNICO esqueceu de
  // preencher, ação real e imediata). Mas pra estes 3 status aqui o
  // "que falta" é uma decisão/ação de quem NÃO é quem está usando o
  // sistema (o cliente aprovar/recusar o orçamento, ou o cliente vir
  // retirar o aparelho) -- exigir isso como se fosse um esquecimento
  // do operador é incoerente: o próprio nome do status ("Aguardando
  // Aprovação"/"Pronto para Entrega") já significa "ainda não temos
  // essa definição, estamos esperando o cliente". O alerta que
  // "aparelho travado" some despercebido continua valendo pros
  // status abaixo (são os únicos onde falta algo que o operador PODE
  // agir agora); pra estes aqui o modal simplesmente não deve abrir.
  const CLIENT_WAIT_STATUSES=new Set(['AGUARDANDO APROVACAO','PRONTO PARA ENTREGA','ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA']);

  // Achado do usuário em 2026-09-03: uma OS com orçamento já lançado
  // (peça/valor) mas travada em "Aguardando Análise" só mostrava um
  // toast de erro -- fácil de não ver/ignorar (foi exatamente o que
  // parece ter acontecido com a OS #03I26G57). Agora é um modal de
  // verdade (mesmo padrão .vx-modal-bg/.vx-modal já usado no resto do
  // app), com a lista do que falta (texto já vem pronto de
  // compute_missing_for_status via result.missing) e um atalho pro
  // picker manual de situação que já existe (manual-status-v0812.js).
  function openMissingStatusModal(result,id){
    document.querySelector('#vxMissingStatusModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxMissingStatusModal';
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal">
      <h3>⚠ Esta OS não avançou de situação</h3>
      <p>Situação atual: <strong>${E(labelOf(result.initial_status))}</strong></p>
      <p>Falta preencher:</p>
      <ul class="vx-missing-status-list">${(result.missing||[]).map(m=>`<li>🔴 ${E(m)}</li>`).join('')}</ul>
      <div class="vx-modal-actions"><button type="button" data-close>Entendi, revisar depois</button><button type="button" class="primary" data-manual>Alterar situação manualmente</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-close]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
    bg.querySelector('[data-manual]').onclick=()=>{close();window.manualStatus?.();};
  }

  // Chamado depois que um campo/evento que participa do fluxo já foi salvo
  // com sucesso (diagnóstico, orçamento, peça, decisão do cliente, início/
  // pronto do conserto, entrega). Nunca chamado sozinho em background nem
  // ao simplesmente abrir uma OS -- só reage a escrita real.
  window.vxAdvanceOsStatus=async function(serviceOrderId){
    const id=serviceOrderId||state?.activeOs?.id;
    if(!id)return null;
    try{
      const r=await api('rpc/advance_service_order_status',{method:'POST',body:JSON.stringify({p_service_order_id:id})});
      const result=Array.isArray(r)?r[0]:r;
      if(!result||result.error)return result;
      // Uma OS com orçamento já lançado (peça/valor) mas travada em
      // "Aguardando Análise" -- o motor está certo (técnico/defeito
      // constatado/serviço também são exigidos), só faltava avisar de
      // forma que não passasse despercebido. Agora QUALQUER chamador
      // (incluir peça, editar financeiro, modo Whirlpool etc.) abre o
      // mesmo modal.
      if(!result.changed){
        if(result.missing?.length&&!CLIENT_WAIT_STATUSES.has(String(result.final_status||'').replaceAll('_',' ')))openMissingStatusModal(result,id);
        return result;
      }
      const o=state.activeOs;
      if(o&&String(o.id)===String(id)){
        o.status=result.final_status;
        const core=state.orders?.find(x=>String(x.id)===String(id));if(core)core.status=result.final_status;
        const badge=document.querySelector('#vxStatusArea strong');if(badge)badge.textContent=labelOf(result.final_status);
        const legacyBadge=document.querySelector('.vx-status-btn');if(legacyBadge)legacyBadge.textContent=labelOf(result.final_status)+' ▼';
      }
      const steps=(result.transitions||[]).map(t=>labelOf(t.new_status));
      const trail=steps.length>1?(' ('+steps.join(' → ')+')'):'';
      toast?.('Situação da OS avançou automaticamente para '+labelOf(result.final_status)+trail+'.');
      return result;
    }catch(e){
      console.error('[os-status-engine] falha ao avaliar avanço automático da OS:',e);
      return null;
    }
  };
  window.vxOsStatusLabel=labelOf;
})();
