/* VoxAssist Web V0.8.12 — Nova OS espelhada na OS aberta */
(function(){
  const V=v=>esc(v??'');
  const U=v=>up(v||'');
  const norm=v=>String(v||'').replace(/\D/g,'');
  let selectedClient=null;

  const f=(label,control,cls='')=>`<div class="vx-newos-field ${cls}"><label>${label}</label>${control}</div>`;

  function clientSuggestions(rows){
    const box=document.querySelector('#newClientMatches'); if(!box)return;
    if(!rows.length){box.innerHTML='<span class="new-client-hint">Nenhum cadastro localizado — continue o preenchimento e o cliente será cadastrado junto com a OS.</span>';return}
    box.innerHTML=rows.slice(0,6).map(c=>`<button type="button" data-client="${c.id}"><b>${V(c.name)}</b><span>${V(c.document||'')} • ${V(c.phone_primary||'')}</span></button>`).join('');
    box.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>chooseClient(b.dataset.client));
  }

  function chooseClient(id){
    const c=(state.clients||[]).find(x=>x.id===id); if(!c)return;
    selectedClient=c;
    const set=(id,v)=>{const el=document.querySelector('#'+id);if(el)el.value=v||''};
    set('newClientName',c.name);set('newClientDoc',c.document);set('newClientPhone',c.phone_primary);set('newClientPhone2',c.phone_secondary);set('newClientEmail',c.email);set('newClientZip',c.zip_code);set('newClientAddress',c.address);set('newClientNumber',c.address_number);set('newClientComplement',c.complement);set('newClientNeighborhood',c.neighborhood);set('newClientCity',c.city);set('newClientState',c.state);
    const box=document.querySelector('#newClientMatches');if(box)box.innerHTML=`<span class="new-client-found">Cliente localizado: <b>${V(c.name)}</b> — dados preenchidos automaticamente.</span>`;
  }

  function lookupClient(){
    const name=U(document.querySelector('#newClientName')?.value),doc=norm(document.querySelector('#newClientDoc')?.value),phone=norm(document.querySelector('#newClientPhone')?.value);
    if(selectedClient){const same=(doc&&norm(selectedClient.document)===doc)||(phone&&norm(selectedClient.phone_primary)===phone)||(name&&U(selectedClient.name)===name);if(!same)selectedClient=null}
    if(!name&&!doc&&!phone)return clientSuggestions([]);
    const rows=(state.clients||[]).filter(c=>{const cn=U(c.name),cd=norm(c.document),cp=norm(c.phone_primary),cp2=norm(c.phone_secondary);return (doc&&cd===doc)||(phone&&(cp===phone||cp2===phone))||(name.length>=3&&cn.includes(name))});
    if(rows.length===1&&((doc&&norm(rows[0].document)===doc)||(phone&&norm(rows[0].phone_primary)===phone)||name===U(rows[0].name)))return chooseClient(rows[0].id);
    clientSuggestions(rows);
  }

  async function ensureClient(){
    if(selectedClient)return selectedClient.id;
    const body={name:U($('#newClientName').value),document:U($('#newClientDoc').value),phone_primary:U($('#newClientPhone').value),phone_secondary:U($('#newClientPhone2').value),email:$('#newClientEmail').value.trim(),zip_code:U($('#newClientZip').value),address:U($('#newClientAddress').value),address_number:U($('#newClientNumber').value),complement:U($('#newClientComplement').value),neighborhood:U($('#newClientNeighborhood').value),city:U($('#newClientCity').value),state:U($('#newClientState').value),person_type:norm($('#newClientDoc').value).length>11?'PJ':'PF'};
    if(!body.name||!body.phone_primary)throw new Error('Informe NOME e TELEFONE do cliente.');
    if(body.document){
      const found=(state.clients||[]).find(c=>norm(c.document)===norm(body.document));if(found){selectedClient=found;return found.id}
      const q=await api(`clients?document=eq.${encodeURIComponent(body.document)}&select=*`).catch(()=>[]);if(q?.length){selectedClient=q[0];return q[0].id}
    }
    const created=await api('clients',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});selectedClient=created[0];state.clients.push(created[0]);return created[0].id;
  }

  window.renderNewOs=async function(){
    selectedClient=null;
    const title=document.querySelector('#title');if(title)title.textContent='Nova Ordem de Serviço';
    document.querySelector('#app').innerHTML=`<form id="osForm" class="vx-newos-wrap">
      <div class="vx-newos-head"><div class="vx-newos-title">NOVA ORDEM DE SERVIÇO</div><div><button type="button" class="vx-newos-status">RASCUNHO</button></div></div>
      <div class="vx-newos-tabs"><button type="button" class="active">O.S.</button><button type="button">Equipamento</button><button type="button">Cliente</button><button type="button" disabled>Orçamento</button><button type="button" disabled>Fotos / Anexos</button><button type="button" disabled>Financeiro</button><button type="button" disabled>Histórico</button></div>
      <section class="vx-newos-panel"><div class="vx-newos-grid">
        <div class="vx-newos-box"><h3>1. RESUMO DO CLIENTE</h3>
          <div class="new-client-search-grid">
            ${f('NOME / RAZÃO SOCIAL *','<input id="newClientName" required autocomplete="off">')}
            ${f('CPF / CNPJ','<input id="newClientDoc" autocomplete="off">')}
            ${f('TELEFONE PRINCIPAL *','<input id="newClientPhone" required autocomplete="off">')}
          </div>
          <div id="newClientMatches" class="new-client-matches"><span class="new-client-hint">Nome, CPF/CNPJ e telefone são ao mesmo tempo campos de pesquisa e cadastro.</span></div>
          <div class="vx-newos-field-grid">
            ${f('+ OUTRO TELEFONE','<input id="newClientPhone2">')}${f('E-MAIL','<input id="newClientEmail" type="email">','span2')}
            ${f('CEP','<input id="newClientZip">')}${f('ENDEREÇO','<input id="newClientAddress">','span2')}
            ${f('NÚMERO','<input id="newClientNumber">')}${f('COMPLEMENTO','<input id="newClientComplement">')}${f('BAIRRO','<input id="newClientNeighborhood">')}
            ${f('CIDADE','<input id="newClientCity">','span2')}${f('ESTADO','<input id="newClientState">')}
          </div>
        </div>
        <div class="vx-newos-box"><h3>2. RESUMO DO EQUIPAMENTO / ORDEM DE SERVIÇO</h3>
          <div class="vx-newos-field-grid two">
            ${f('TIPO DE PRODUTO *','<input id="productType" required placeholder="TV / REFRIGERADOR / AR-CONDICIONADO">')}
            ${f('GRUPO DO PRODUTO','<input id="productGroup" readonly placeholder="AUTOMÁTICO">')}
            ${f('MARCA','<input id="brand">')}${f('MODELO','<input id="model">')}
            ${f('Nº DE SÉRIE','<input id="serial">')}${f('ESTADO DO APARELHO','<select id="condition"><option></option><option>NOVO</option><option>USADO</option><option>ARRANHADO</option><option>AVARIADO</option></select>')}
            ${f('ACESSÓRIOS','<input id="accessories" placeholder="SEM ACESSÓRIOS">')}${f('TIPO DE ATENDIMENTO','<select id="serviceType"><option>INTERNO</option><option>EXTERNO</option></select>')}
            ${f('LOCAL DO PRODUTO','<select id="productLocation"><option>LABORATÓRIO</option><option>CONSUMIDOR</option></select>')}${f('LOJA *','<select id="storeSelect"><option value="">CARREGANDO…</option></select>')}
            ${f('GRUPO DE ATENDIMENTO','<select id="serviceGroupSelect"><option value="">SEM GRUPO</option></select>','wide')}
            ${f('DEFEITO RELATADO *','<textarea id="reported" required></textarea>','wide')}
          </div>
          <input id="notes" type="hidden" value=""><button type="button" class="vx-newos-f11" id="newNotesBtn">F11 – OBSERVAÇÕES INTERNAS</button>
          <div class="vx-events new-os-events"><div class="vx-events-title">EVENTOS CONFIRMADOS</div><div class="vx-event-grid"><div class="vx-event"><b>ENTRADA</b><span>AUTOMÁTICA AO SALVAR</span></div><div class="vx-event"><b>ANÁLISE</b><span>—</span></div><div class="vx-event"><b>APROVAÇÃO</b><span>—</span></div><div class="vx-event"><b>CONSERTO</b><span>—</span></div><div class="vx-event"><b>PRONTO</b><span>—</span></div><div class="vx-event"><b>ENTREGA</b><span>—</span></div></div></div>
        </div>
      </div>
      <div class="vx-newos-actions"><button type="button" class="cancel" onclick="render('os')">CANCELAR</button><button type="button" class="advance" id="saveAdvance">CRIAR O.S.</button></div></section>
    </form>
    <div id="newNotesModal" class="vx-newos-modal hidden"><div class="vx-newos-modal-card"><h3>F11 – OBSERVAÇÕES INTERNAS</h3><p style="font-size:11px;color:#607185">Conteúdo interno. Não será impresso nos documentos do cliente.</p><textarea id="newNotesText"></textarea><div class="vx-newos-modal-actions"><button type="button" class="cancel" id="newNotesCancel">CANCELAR</button><button type="button" class="save" id="newNotesSave">SALVAR OBSERVAÇÃO</button></div></div></div>`;

    ['newClientName','newClientDoc','newClientPhone'].forEach(id=>document.querySelector('#'+id).addEventListener('input',()=>{document.querySelector('#'+id).value=U(document.querySelector('#'+id).value);lookupClient()}));
    ['newClientPhone2','newClientZip','newClientAddress','newClientNumber','newClientComplement','newClientNeighborhood','newClientCity','newClientState','productType','brand','model','serial','accessories','reported'].forEach(id=>document.querySelector('#'+id)?.addEventListener('input',()=>{document.querySelector('#'+id).value=U(document.querySelector('#'+id).value)}));
    const group=document.querySelector('#productGroup'),type=document.querySelector('#productType');const infer=t=>{t=U(t);if(t.includes('TV'))return'TV';if(/REFRIG|FREEZER|AR-COND|GELADEIRA/.test(t))return'REFRIGERAÇÃO';if(/MICRO|FOG|LAVA|BEBED/.test(t))return'LINHA BRANCA';if(/AUDIO|SOM/.test(t))return'ÁUDIO';return t?'GERAL':''};type.addEventListener('input',()=>group.value=infer(type.value));
    // Achado do usuário em 2026-09-04: store_id ficava null quando quem
    // cria a OS não tem profiles.store_id fixo (ex.: gestor com acesso
    // a mais de uma loja) -- a OS nunca sabia "de qual loja" ela era,
    // e o cabeçalho ficava sem mostrar LOJA. Seleção manual, obrigatória,
    // pré-marcada na loja do próprio perfil quando ele tiver uma só.
    (async()=>{
      const cid=state.profile?.active_company_id;
      const [stores,groups]=await Promise.all([
        cid?api(`stores?company_id=eq.${cid}&active=eq.true&select=id,name&order=name`).catch(()=>[]):[],
        cid?api(`service_groups?company_id=eq.${cid}&active=eq.true&select=id,name&order=name`).catch(()=>[]):[],
      ]);
      const sel=document.querySelector('#storeSelect');
      if(sel){
        sel.innerHTML=stores.length?`<option value="">SELECIONE…</option>${stores.map(s=>`<option value="${V(s.id)}">${V(s.name)}</option>`).join('')}`:'<option value="">Nenhuma loja cadastrada</option>';
        if(state.profile?.store_id&&stores.some(s=>String(s.id)===String(state.profile.store_id)))sel.value=state.profile.store_id;
        else if(stores.length===1)sel.value=stores[0].id;
      }
      // Achado do usuário em 2026-09-04: "Grupo de Atendimento" (área de
      // responsabilidade que o gestor cadastra em Configurações) --
      // diferente de "GRUPO DO PRODUTO" acima (esse é só sugestão
      // automática por tipo de aparelho). Escolha manual, opcional.
      const gsel=document.querySelector('#serviceGroupSelect');
      if(gsel)gsel.innerHTML=`<option value="">SEM GRUPO</option>${groups.map(g=>`<option value="${V(g.id)}">${V(g.name)}</option>`).join('')}`;
    })();
    const modal=document.querySelector('#newNotesModal'),noteText=document.querySelector('#newNotesText'),noteHidden=document.querySelector('#notes');document.querySelector('#newNotesBtn').onclick=()=>{noteText.value=noteHidden.value||'';modal.classList.remove('hidden');noteText.focus()};document.querySelector('#newNotesCancel').onclick=()=>modal.classList.add('hidden');document.querySelector('#newNotesSave').onclick=()=>{noteHidden.value=U(noteText.value);modal.classList.add('hidden');toast('Observação interna preparada para salvar com a OS.')};
    document.querySelector('#saveAdvance').onclick=e=>saveNewUnified(e,true);
  };

  async function saveNewUnified(e,advance){
    e?.preventDefault?.();const btns=[...document.querySelectorAll('.vx-newos-actions button')];btns.forEach(b=>b.disabled=true);
    try{
      const client=await ensureClient(),product=U($('#productType').value),reported=U($('#reported').value);if(!product||!reported)throw new Error('Informe TIPO DE PRODUTO e DEFEITO RELATADO.');
      const storeId=$('#storeSelect')?.value||null;if(!storeId)throw new Error('Selecione a LOJA desta OS.');
      const serviceGroupId=$('#serviceGroupSelect')?.value||null;
      const eq=await api('equipments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({current_client_id:client,product_type:product,brand:U($('#brand').value),model:U($('#model').value),serial_number:U($('#serial').value),accessories:U($('#accessories').value||'SEM ACESSÓRIOS')})});if(!eq?.[0]?.id)throw new Error('Não foi possível criar o equipamento.');
      const os=await api('service_orders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({os_number:genOsNumber(),client_id:client,equipment_id:eq[0].id,service_type:$('#serviceType').value,product_location:$('#productLocation').value,device_condition:U($('#condition').value),reported_defect:reported,internal_notes:U($('#notes').value),status:'AGUARDANDO ANALISE',opened_at:new Date().toISOString(),created_by:state.session.user.id,attendant_id:state.session.user.id,store_id:storeId,service_group_id:serviceGroupId})});if(!os?.[0]?.id)throw new Error('Não foi possível criar a ordem de serviço.');
      await api('os_status_history',{method:'POST',body:JSON.stringify({service_order_id:os[0].id,new_status:'AGUARDANDO ANALISE',change_type:'AUTOMATICO',changed_by:state.session.user.id})});toast('OS salva com sucesso.');await loadCore();render(advance?`os:${os[0].id}`:'os');
    }catch(err){toast('Falha ao salvar OS: '+err.message,'err');btns.forEach(b=>b.disabled=false)}
  }
})();
