/* VoxAssist Web V0.9.09 — aba "Documentos" na OS. Plano "Arquitetura
   de Documentos da OS", Fase 1, item 4 (histórico de emissões) +
   parte do item 5 (emitir um documento de verdade), reaproveitando
   100% do que já existe:
   - Mesmo padrão de injeção não-invasiva já usado pela aba Whirlpool
     (os-whirlpool-extension-v0813.js, injectWhirlpoolTab) -- só
     ADICIONA um botão em .vx-os-tabs, nunca mexe nos existentes.
   - window.vxPrintShell (exposto por os-whirlpool-extension-v0813.js)
     -- mesmo visual azul-marinho já aprovado, sem duplicar CSS de
     impressão em outro lugar.
   - RPC create_os_document_emission (migration 20260909070000) --
     snapshot imutável, Termos vigentes no rodapé.

   Escopo desta etapa: um botão NOVO "Emitir documento" registra e
   imprime uma emissão de verdade -- os botões EXISTENTES "GERAR
   PDF"/"IMPRIMIR" do cabeçalho continuam exatamente como estão,
   migrar eles pra este fluxo único é o último passo da Fase 1,
   registrado como pendente na Matriz Mestra (mais arriscado --
   são os botões mais usados no dia a dia, merece sua própria rodada
   com mais cautela). */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const DOC_TYPE_LABELS={ENTRADA:'Entrada',ORCAMENTO:'Orçamento',ENTREGA:'Entrega'};
  const CHANNEL_LABELS={IMPRESSO:'Impresso',PDF:'PDF',WHATSAPP:'WhatsApp'};

  async function injectDocumentsTab(){
    const o=state?.activeOs;if(!o)return;
    const tabs=document.querySelector('.vx-os-tabs');if(!tabs||tabs.querySelector('[data-section="documentos"]'))return;
    const b=document.createElement('button');b.dataset.section='documentos';b.textContent='DOCUMENTOS';b.className='vx-documents-tab';
    b.onclick=()=>showDocumentsPanel(o.id);tabs.appendChild(b);
  }

  async function showDocumentsPanel(id){
    document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section==='documentos'));
    let panel=document.querySelector('#vx-documentos');
    if(!panel){panel=document.createElement('section');panel.id='vx-documentos';panel.className='vx-os-panel';document.querySelector('#app')?.appendChild(panel);}
    panel.classList.remove('hidden');
    panel.innerHTML='<div class="vx-screen-box">Carregando documentos...</div>';
    await renderDocumentsList(id,panel);
  }

  async function renderDocumentsList(id,panel){
    const rows=await api(`os_document_emissions?service_order_id=eq.${id}&select=*&order=generated_at.desc`).catch(()=>[]);
    const userIds=[...new Set(rows.map(r=>r.generated_by).filter(Boolean))];
    const users=userIds.length?await api(`profiles?id=in.(${userIds.join(',')})&select=id,full_name`).catch(()=>[]):[];
    const userMap=Object.fromEntries(users.map(u=>[u.id,u.full_name]));
    panel.innerHTML=`<div class="vx-screen-box">
      <div class="vx-wp-head"><div><h3>DOCUMENTOS DESTA OS</h3><small>Cada emissão é um retrato imutável -- reabrir mostra exatamente os dados e os Termos vigentes na hora em que foi gerado.</small></div><button class="vx-action" id="vxDocNew">+ EMITIR DOCUMENTO</button></div>
      <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row"><b>${DOC_TYPE_LABELS[r.document_type]||r.document_type} · v${r.document_version}</b><span>${new Date(r.generated_at).toLocaleString('pt-BR')} · ${CHANNEL_LABELS[r.channel]||r.channel} · ${E(userMap[r.generated_by]||'—')}</span><div class="vx-sg-row-actions"><button type="button" data-reopen="${E(r.id)}">Reabrir</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum documento emitido ainda pra esta OS.</p>'}</div>
    </div>`;
    panel.querySelectorAll('[data-reopen]').forEach(b=>b.onclick=()=>{
      const r=rows.find(x=>String(x.id)===b.dataset.reopen);
      if(r)reopenEmission(r);
    });
    document.getElementById('vxDocNew').onclick=()=>openEmitModal(id);
  }

  function reopenEmission(r){
    const d=r.data_snapshot||{};
    const rowsHtml=Object.entries(d).map(([k,v])=>`<div class="row"><b>${E(k.toUpperCase())}</b><span>${E(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('');
    const body=`<div class="doc vox"><div class="head"><div><b>${DOC_TYPE_LABELS[r.document_type]||r.document_type} · v${r.document_version}</b></div><div class="muted">${new Date(r.generated_at).toLocaleString('pt-BR')} · ${CHANNEL_LABELS[r.channel]||r.channel}</div></div>
      <div class="box"><h3>DADOS DESTA EMISSÃO</h3>${rowsHtml||'<p>Sem dados registrados.</p>'}</div>
      ${r.terms_snapshot?`<div class="box"><h3>TERMOS E CONDIÇÕES (v${r.terms_version})</h3><p style="white-space:pre-wrap">${E(r.terms_snapshot)}</p></div>`:''}
      <div class="footer">Esta é uma cópia arquivada -- não reflete alterações feitas na OS depois desta emissão.</div></div>`;
    if(typeof window.vxPrintShell==='function')window.vxPrintShell('Documento '+(DOC_TYPE_LABELS[r.document_type]||r.document_type)+' v'+r.document_version,body);
    else toast?.('Não foi possível abrir a visualização.','err');
  }

  async function openEmitModal(id){
    document.querySelector('#vxDocEmitModal')?.remove();
    const ov=document.createElement('div');ov.id='vxDocEmitModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Emitir documento</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form">
      <label>TIPO *</label><select name="document_type">${Object.entries(DOC_TYPE_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      <p class="vx-sg-help">Registra uma emissão nova (com os dados atuais da OS e os Termos vigentes) e abre pra impressão/PDF.</p>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">EMITIR</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        const snapshot=await buildDataSnapshot(id);
        const r=await api('rpc/create_os_document_emission',{method:'POST',body:JSON.stringify({p_service_order_id:id,p_document_type:f.get('document_type'),p_data_snapshot:snapshot,p_channel:'IMPRESSO'})});
        ov.remove();
        toast?.('Documento emitido.');
        const row=Array.isArray(r)?r[0]:r;
        if(row)reopenEmission(row);
        await showDocumentsPanel(id);
      }catch(err){toast?.('Não foi possível emitir: '+err.message,'err');btn.disabled=false;}
    };
  }

  async function buildDataSnapshot(id){
    const [osRows,parts,finRows]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*)`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`).catch(()=>[]),
    ]);
    const o=osRows?.[0]||{},c=o.clients||{},e=o.equipments||{},fin=finRows?.[0]||{};
    const partsTotal=(parts||[]).reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);
    return {
      os_numero:o.os_number||'',cliente:c.name||'',cliente_documento:c.document||'',
      equipamento:[e.product_type,e.brand,e.model].filter(Boolean).join(' • '),
      defeito_relatado:o.reported_defect||'',defeito_constatado:o.diagnosed_defect||'',servico:o.technical_service||'',
      pecas_total:money(partsTotal),mao_de_obra:money(fin.labor_value||0),total:money(total),
    };
  }

  const baseRender=window.renderOsDetail;
  if(typeof baseRender==='function')window.renderOsDetail=async function(){const r=await baseRender.apply(this,arguments);setTimeout(injectDocumentsTab,120);return r};
  setTimeout(injectDocumentsTab,550);
})();
