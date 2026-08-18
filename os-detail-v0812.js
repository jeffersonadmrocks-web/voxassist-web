/* VoxAssist Web V0.8.12 — detalhe da OS no padrão Desktop aprovado */
(function(){
  const fmtStatus=s=>String(s||'').replaceAll('_',' ');
  const inferGroup=t=>{t=String(t||'').toUpperCase();if(t.includes('TV'))return 'TV';if(t.includes('REFRIG')||t.includes('FREEZER')||t.includes('AR-COND'))return 'REFRIGERAÇÃO';if(t.includes('MICRO')||t.includes('FOG')||t.includes('LAVA')||t.includes('BEBED'))return 'LINHA BRANCA';return 'GERAL'};
  const val=v=>esc(v||'');
  const ro=(label,value,cls='')=>`<div class="vx-field ${cls}"><label>${label}</label><input value="${val(value)}" readonly></div>`;
  const ta=(label,value,cls='')=>`<div class="vx-field ${cls}"><label>${label}</label><textarea readonly>${val(value)}</textarea></div>`;
  const eventDate=(hist,statuses)=>{const h=(hist||[]).filter(x=>statuses.includes(x.new_status)).sort((a,b)=>new Date(a.changed_at)-new Date(b.changed_at))[0];return h?dt(h.changed_at):'—'};
  const showOsSection=id=>{document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));document.querySelector('#vx-'+id)?.classList.remove('hidden');document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section===id));};
  window.showVxOsSection=showOsSection;

  window.renderOsDetail=async function(id){
    const arr=await api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`);
    const o=arr?.[0];if(!o)return document.querySelector('#app').innerHTML='<div class="card">OS não encontrada.</div>';
    state.activeOs=o;const title=document.querySelector('#title');if(title)title.textContent='OS '+o.os_number;
    const [hist,parts,fin,atts]=await Promise.all([
      api(`os_status_history?service_order_id=eq.${id}&select=*&order=changed_at.desc`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*`).catch(()=>[]),
      api(`attachments?service_order_id=eq.${id}&select=*&order=created_at.desc`).catch(()=>[])
    ]);
    const c=o.clients||{},e=o.equipments||{},f=fin?.[0]||{};
    const partsTotal=(parts||[]).reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_value||0),0);
    const labor=Number(f.labor_value||0),discount=Number(f.discount_value||0),total=Math.max(0,partsTotal+labor-discount);
    const app=document.querySelector('#app');
    app.innerHTML=`<div class="vx-os-wrap">
      <div class="vx-os-head">
        <div class="vx-os-head-left"><div class="vx-os-number">${esc(o.os_number)}</div><button class="vx-status-btn" onclick="manualStatus()">${esc(fmtStatus(o.status))} ▼</button><button class="vx-back" onclick="render('os')">← VOLTAR</button></div>
        <div class="vx-os-head-actions"><button class="vx-action attention" onclick="render('agenda')">CASO DE ATENÇÃO</button><button class="vx-action parts" onclick="showVxOsSection('orcamento');setTimeout(()=>addManualPart(),50)">SOLICITAR PEÇA</button><button class="vx-action" onclick="showVxOsSection('os')">GERAR PARECER ▼</button><button class="vx-action" onclick="printOs()">GERAR PDF</button><button class="vx-action" onclick="window.print()">IMPRIMIR ▼</button></div>
      </div>
      <div class="vx-os-tabs">
        ${[['os','O.S.'],['equip','Equipamento'],['cliente','Cliente'],['orcamento','Orçamento'],['anexos','Fotos / Anexos'],['financeiro','Financeiro'],['historico','Histórico']].map(([k,l],i)=>`<button data-section="${k}" class="${i===0?'active':''}" onclick="showVxOsSection('${k}')">${l}</button>`).join('')}
      </div>
      <section id="vx-os" class="vx-os-panel">
        <div class="vx-os-summary-grid">
          <div class="vx-os-box"><h3>1. RESUMO DO CLIENTE</h3><div class="vx-field"><label>LOCALIZAR CLIENTE (NOME / CPF / TELEFONE)</label><div class="vx-client-search"></div><div class="vx-client-result"></div></div>
            <div class="vx-field-grid">${ro('NOME / RAZÃO SOCIAL *',c.name,'span2')}${ro('CPF / CNPJ',c.document)}${ro('TELEFONE PRINCIPAL *',c.phone_primary)}${ro('+ OUTRO TELEFONE',c.phone_secondary)}${ro('E-MAIL',c.email)}${ro('CEP',c.zip_code)}${ro('ENDEREÇO',c.address,'span2')}${ro('NÚMERO',c.address_number)}${ro('COMPLEMENTO',c.complement)}${ro('BAIRRO',c.neighborhood)}${ro('CIDADE',c.city,'span2')}${ro('ESTADO',c.state)}</div>
          </div>
          <div class="vx-os-box"><h3>2. RESUMO DO EQUIPAMENTO / ORDEM DE SERVIÇO</h3>
            <div class="vx-field-grid two">${ro('TIPO DE PRODUTO *',e.product_type)}${ro('GRUPO DO PRODUTO',inferGroup(e.product_type))}${ro('MARCA',e.brand)}${ro('MODELO',e.model)}${ro('Nº DE SÉRIE',e.serial_number)}${ro('ESTADO DO APARELHO',o.device_condition)}${ro('ACESSÓRIOS','SEM ACESSÓRIOS')}${ro('TIPO DE ATENDIMENTO',o.service_type)}${ro('LOCAL DO PRODUTO',o.product_location)}${ta('DEFEITO RELATADO *',o.reported_defect,'wide')}</div>
            <button class="vx-f11" onclick="document.querySelector('#vxInternal')?.focus()">F11 – OBSERVAÇÕES INTERNAS</button>
            <div class="vx-events"><div class="vx-events-title">EVENTOS CONFIRMADOS</div><div class="vx-event-grid">
              <div class="vx-event"><b>ENTRADA</b><span>${dt(o.opened_at)}</span></div><div class="vx-event"><b>ANÁLISE</b><span>${eventDate(hist,['AGUARDANDO ANALISE'])}</span></div><div class="vx-event"><b>APROVAÇÃO</b><span>${eventDate(hist,['AGUARDANDO CONSERTO'])}</span></div>
              <div class="vx-event"><b>CONSERTO</b><span>${eventDate(hist,['AGUARDANDO CONSERTO'])}</span></div><div class="vx-event"><b>PRONTO</b><span>${eventDate(hist,['PRONTO PARA ENTREGA'])}</span></div><div class="vx-event"><b>ENTREGA</b><span>${o.closed_at?dt(o.closed_at):'—'}</span></div>
            </div></div>
          </div>
        </div>
        <div class="vx-budget-strip"><h3>3. RESUMO DO ORÇAMENTO</h3><div class="vx-budget-values"><div class="vx-budget-value"><span>PEÇAS</span><b>${money(partsTotal)}</b></div><div class="vx-budget-value"><span>MÃO DE OBRA</span><b>${money(labor)}</b></div><div class="vx-budget-value"><span>DESCONTO</span><b>${money(discount)}</b></div><div class="vx-budget-value"><span>TOTAL</span><b>${money(total)}</b></div></div></div>
        <div style="margin-top:8px" class="vx-os-box green"><h3>4. ANÁLISE / PARECER TÉCNICO</h3><div class="vx-field-grid two"><div class="vx-field wide"><label>DEFEITO CONSTATADO</label><textarea id="diagnosed">${val(o.diagnosed_defect)}</textarea></div><div class="vx-field wide"><label>SERVIÇO TÉCNICO</label><textarea id="techService">${val(o.technical_service)}</textarea></div><div class="vx-field wide"><label>F11 – OBSERVAÇÕES INTERNAS — NÃO IMPRIMIR</label><textarea id="vxInternal">${val(o.internal_notes)}</textarea></div></div><div class="vx-os-actions-bottom"><button class="vx-action parts" onclick="saveTechnical()">SALVAR PARECER</button><button class="vx-action" onclick="saveInternalNotes()">SALVAR F11</button><button class="vx-action" onclick="saveAdvanceCurrent()">SALVAR E AVANÇAR</button></div></div>
      </section>
      <section id="vx-equip" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Equipamento</h3><div class="vx-field-grid two">${ro('TIPO',e.product_type)}${ro('GRUPO',inferGroup(e.product_type))}${ro('MARCA',e.brand)}${ro('MODELO',e.model)}${ro('Nº SÉRIE',e.serial_number)}${ro('ESTADO',o.device_condition)}${ro('NOTA FISCAL',e.invoice_number)}${ro('DATA NF',e.invoice_date)}${ro('GARANTIA',e.warranty_info,'wide')}</div></div></section>
      <section id="vx-cliente" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Cliente / Cliente 360</h3><div class="vx-field-grid">${ro('NOME',c.name,'span2')}${ro('CPF/CNPJ',c.document)}${ro('TELEFONE',c.phone_primary)}${ro('OUTRO TELEFONE',c.phone_secondary)}${ro('E-MAIL',c.email)}${ro('CEP',c.zip_code)}${ro('ENDEREÇO',c.address,'span2')}${ro('NÚMERO',c.address_number)}${ro('COMPLEMENTO',c.complement)}${ro('BAIRRO',c.neighborhood)}${ro('CIDADE',c.city,'span2')}${ro('UF',c.state)}</div><div class="vx-os-actions-bottom"><button class="vx-action" onclick="renderClient360('${o.client_id}')">ABRIR CLIENTE 360</button></div></div></section>
      <section id="vx-orcamento" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Orçamento / Peças</h3><div class="vx-os-actions-bottom"><button class="vx-action parts" onclick="addManualPart()">+ INCLUIR PEÇA MANUAL</button></div><table class="vx-os-table"><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QTD.</th><th>UNIT.</th><th>TOTAL</th><th>ORIGEM</th></tr></thead><tbody>${(parts||[]).map(x=>`<tr><td>${val(x.code||'—')}</td><td>${val(x.description)}</td><td>${x.quantity}</td><td>${money(x.unit_value)}</td><td>${money(Number(x.quantity||0)*Number(x.unit_value||0))}</td><td>${x.is_manual?'MANUAL':'ESTOQUE'}</td></tr>`).join('')||'<tr><td colspan="6" class="vx-empty">Nenhuma peça incluída.</td></tr>'}</tbody></table></div></section>
      <section id="vx-anexos" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Fotos / Anexos</h3>${(atts||[]).map(a=>`<div class="vx-attach-row"><span><b>${val(a.category)}</b> — ${val(a.file_name)}</span><span>${dt(a.created_at)}</span></div>`).join('')||'<div class="vx-empty">Nenhum anexo cadastrado.</div>'}<div class="vx-os-actions-bottom"><button class="vx-action" onclick="render('feature:anexos')">ABRIR CENTRAL DE ANEXOS</button></div></div></section>
      <section id="vx-financeiro" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Financeiro da OS</h3><div class="vx-field-grid two"><div class="vx-field"><label>MÃO DE OBRA</label><input id="labor" type="number" step=".01" value="${labor}"></div><div class="vx-field"><label>DESCONTO</label><input id="discount" type="number" step=".01" value="${discount}"></div><div class="vx-field wide"><label>OBSERVAÇÕES FINANCEIRAS</label><textarea id="finNotes">${val(f.notes)}</textarea></div></div><div class="vx-budget-strip"><div class="vx-budget-values"><div class="vx-budget-value"><span>PEÇAS</span><b>${money(partsTotal)}</b></div><div class="vx-budget-value"><span>MÃO DE OBRA</span><b>${money(labor)}</b></div><div class="vx-budget-value"><span>DESCONTO</span><b>${money(discount)}</b></div><div class="vx-budget-value"><span>TOTAL</span><b>${money(total)}</b></div></div></div><div class="vx-os-actions-bottom"><button class="vx-action parts" onclick="saveFinancial('${f.id||''}')">SALVAR FINANCEIRO</button></div></div></section>
      <section id="vx-historico" class="vx-os-panel hidden"><div class="vx-os-section"><h3>Histórico da OS</h3>${(hist||[]).map(h=>`<div class="vx-history-item"><b>${val(fmtStatus(h.new_status))}</b><span>${dt(h.changed_at)} • ${val(h.change_type)}${h.reason?' • Motivo: '+val(h.reason):''}</span></div>`).join('')||'<div class="vx-empty">Sem histórico.</div>'}</div></section>
    </div>`;
    applyUppercase();
  };
})();
