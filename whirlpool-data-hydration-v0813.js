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
        consumidor:first(c.name,p.consumidor,p.cliente),cnpjCpf:first(c.document,p.cnpjCpf,p.documento),cep:first(c.zip_code,p.cep),regiao:p.regiao,
        endereco:first(c.address,p.endereco),complemento:first(c.complement,p.complemento),bairro:first(c.neighborhood,p.bairro),cidade:first(c.city,p.cidade),uf:first(c.state,p.uf),
        enderecoEletronico:first(c.email,p.enderecoEletronico,p.email),foneResidencia:first(c.phone_primary,p.foneResidencia,p.telefone),foneComercial:first(c.phone_secondary,p.foneComercial),foneOutros:p.foneOutros,localizacao:p.localizacao,
        produto:first(p.produto,p.productLine,e.model,e.product_type),produtoConsumidor:p.produtoConsumidor,marca:first(e.brand,p.marca,p.manufacturer),linha:first(e.product_type,p.linha),serie:first(e.serial_number,p.serie),nomeComercial:p.nomeComercial,tempoUso:p.tempoUso,
        tipoOS:first(o.order_type,p.tipoOS),nrNotaFiscal:first(e.invoice_number,p.nrNotaFiscal,p.notaFiscal),dataCompra:first(e.purchase_date,p.dataCompra),cor:first(p.cor,e.color),voltagem:first(p.voltagem,e.voltage),capacidade:first(p.capacidade,e.capacity),
        defeitoReclamado:first(o.reported_defect,p.defeitoReclamado),defeitoReclamado2:p.defeitoReclamado2,defeitoConstatado:first(o.diagnosed_defect,p.defeitoConstatado),defeitoConstatado2:p.defeitoConstatado2,
        reclamacaoAtendimento:first(p.reclamacaoAtendimento,p.reclamacao,o.reported_defect),laudoTecnico:first(o.technical_service,p.laudoTecnico),observacao:p.observacao,
        validadeOrcamento:first(p.validadeOrcamento,'10 DIAS'),parcelas:p.parcelas,vencimento:p.vencimento,condicaoPagamento:p.condicaoPagamento,dataAprovacao:first(o.approval_date,p.dataAprovacao),garantiaServico:p.garantiaServico,garantiaPecas:p.garantiaPecas,dataConclusao:p.dataConclusao,responsavel:p.responsavel
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