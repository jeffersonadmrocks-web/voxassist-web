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
      // Achado do usuário em 2026-09-03: uma OS com orçamento já
      // lançado (peça/valor) parecia travada em "Aguardando Análise"
      // -- o motor estava certo (técnico/defeito constatado/serviço
      // também são exigidos), só ninguém avisava o que faltava fora
      // do botão SALVAR global. Agora QUALQUER chamador (incluir
      // peça, editar financeiro, etc.) mostra o mesmo aviso.
      if(!result.changed){
        if(result.missing?.length)toast?.('A OS não avançou de situação. Falta: '+result.missing.join(' • ')+'.','err');
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
