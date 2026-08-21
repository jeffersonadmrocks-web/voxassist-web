/* VoxAssist V0.8.13 — hidratação confiável dos dados existentes na OS Whirlpool */
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const stateRef=()=>typeof state!=='undefined'?state:null;
  const first=(...vals)=>vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';
  const set=(form,name,value)=>{const el=form.querySelector(`[name="${name}"]`);if(!el)return;if(String(el.value||'').trim()===''&&value!==undefined&&value!==null)el.value=String(value)};
  async function hydrate(){
    const form=$('#vxWpForm');const st=stateRef(),id=st?.activeOs?.id;if(!form||!id||form.dataset.wpHydratedFull==='1')return;
    form.dataset.wpHydratedFull='loading';
    try{
      const [osRows,impRows,apptRows]=await Promise.all([
        api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(*)`),
        api(`manufacturer_imports?service_order_id=eq.${id}&select=extracted_data&order=created_at.desc&limit=1`).catch(()=>[]),
        api(`appointments?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[])
      ]);
      const o=osRows?.[0]||st.activeOs||{},c=o.clients||{},e=o.equipments||{},p=impRows?.[0]?.extracted_data||{},a=apptRows?.[0]||{};
      const map={
        numeroOS:first(o.manufacturer_os_number,o.os_number,p.numeroOS),
        tecnico:first(o.profiles?.full_name,p.tecnico),
        dataAgenda:first(a.appointment_date,p.dataAgenda),periodo:first(a.period,p.periodo),tipoAgenda:first(a.appointment_type,p.tipoAgenda),dataChamado:first(p.dataChamado,String(o.opened_at||'').slice(0,10)),
        consumidor:first(p.consumidor,p.cliente,c.name),cnpjCpf:first(p.cnpjCpf,p.documento,c.document),cep:first(p.cep,c.zip_code),regiao:p.regiao,
        endereco:first(p.endereco,c.address),complemento:first(p.complemento,c.complement),bairro:first(p.bairro,c.neighborhood),cidade:first(p.cidade,c.city),uf:first(p.uf,c.state),
        enderecoEletronico:first(p.enderecoEletronico,p.email,c.email),foneResidencia:first(p.foneResidencia,p.telefone,c.phone_primary),foneComercial:first(p.foneComercial,c.phone_secondary),foneOutros:p.foneOutros,localizacao:p.localizacao,
        produto:first(p.produto,p.productLine,e.model,e.product_type),produtoConsumidor:p.produtoConsumidor,marca:first(p.marca,p.manufacturer,e.brand),linha:first(p.linha,e.product_type),serie:first(p.serie,e.serial_number),nomeComercial:first(p.nomeComercial,e.model),tempoUso:p.tempoUso,
        tipoOS:first(p.tipoOS,o.order_type),nrNotaFiscal:first(p.nrNotaFiscal,p.notaFiscal,e.invoice_number),dataCompra:first(p.dataCompra,e.purchase_date),cor:first(p.cor,e.color),voltagem:first(p.voltagem,e.voltage),capacidade:first(p.capacidade,e.capacity),
        defeitoReclamado:first(p.defeitoReclamado,o.reported_defect),defeitoReclamado2:p.defeitoReclamado2,defeitoConstatado:first(p.defeitoConstatado,o.diagnosed_defect),defeitoConstatado2:p.defeitoConstatado2,
        reclamacaoAtendimento:first(p.reclamacaoAtendimento,p.reclamacao,o.reported_defect),laudoTecnico:first(p.laudoTecnico,o.technical_service),observacao:p.observacao,
        validadeOrcamento:first(p.validadeOrcamento,'10 DIAS'),parcelas:p.parcelas,vencimento:p.vencimento,condicaoPagamento:p.condicaoPagamento,dataAprovacao:first(p.dataAprovacao,o.approval_date),garantiaServico:p.garantiaServico,garantiaPecas:p.garantiaPecas,dataConclusao:p.dataConclusao,responsavel:p.responsavel
      };
      Object.entries(map).forEach(([k,v])=>set(form,k,v));
      st.activeOs={...st.activeOs,...o,clients:c,equipments:e,profiles:o.profiles||st.activeOs?.profiles};
      form.dataset.wpHydratedFull='1';
      form.dispatchEvent(new Event('input',{bubbles:true}));
    }catch(e){form.dataset.wpHydratedFull='';console.error('Whirlpool hydrate',e);if(typeof toast==='function')toast('Não foi possível carregar todos os dados da OS Whirlpool. Atualize a tela e tente novamente.','err')}
  }
  const mo=new MutationObserver(()=>{if($('#vxWpForm'))setTimeout(hydrate,120)});mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-section="whirlpool"]'))setTimeout(hydrate,250)},true);
  setTimeout(hydrate,900);
})();