/* Nova OS V0.8.12 — mesma gramática visual da consulta de OS */
(function(){
  const clientOptionsNew=()=>state.clients.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.phone_primary||'SEM TELEFONE')}</option>`).join('');
  const f=(label,control,cls='')=>`<div class="vx-newos-field ${cls}"><label>${label}</label>${control}</div>`;

  window.renderNewOs=async function(){
    const title=document.querySelector('#title');if(title)title.textContent='Nova Ordem de Serviço';
    document.querySelector('#app').innerHTML=`<form id="osForm" class="vx-newos-wrap">
      <div class="vx-newos-head"><div class="vx-newos-title">NOVA ORDEM DE SERVIÇO</div><div><button type="button" class="vx-newos-status">RASCUNHO</button></div></div>
      <div class="vx-newos-tabs">
        <button type="button" class="active" data-focus="clientId">O.S.</button>
        <button type="button" data-focus="productType">Equipamento</button>
        <button type="button" data-focus="clientId">Cliente</button>
        <button type="button" data-focus="reported">Atendimento</button>
        <button type="button" disabled>Orçamento</button><button type="button" disabled>Fotos / Anexos</button><button type="button" disabled>Financeiro</button><button type="button" disabled>Histórico</button>
      </div>
      <section class="vx-newos-panel"><div class="vx-newos-grid">
        <div class="vx-newos-box" id="newClientBox"><h3>1. RESUMO DO CLIENTE</h3>
          <div class="vx-newos-field"><label>LOCALIZAR / SELECIONAR CLIENTE *</label><select id="clientId" required><option value="">SELECIONE...</option>${clientOptionsNew()}</select></div>
          <div class="vx-newos-actions-inline" style="margin-top:8px"><button type="button" class="vx-newos-f11" id="quickClient">+ CADASTRAR CLIENTE</button></div>
          <div class="vx-client-summary" id="newClientSummary">Selecione um cliente para visualizar os dados principais.</div>
        </div>
        <div class="vx-newos-box" id="newEquipmentBox"><h3>2. RESUMO DO EQUIPAMENTO / ORDEM DE SERVIÇO</h3>
          <div class="vx-newos-field-grid two">
            ${f('TIPO DE PRODUTO *','<input id="productType" required placeholder="TV / REFRIGERADOR / AR-CONDICIONADO">')}
            ${f('GRUPO DO PRODUTO','<input id="productGroup" readonly placeholder="AUTOMÁTICO">')}
            ${f('MARCA','<input id="brand">')}${f('MODELO','<input id="model">')}
            ${f('Nº DE SÉRIE','<input id="serial">')}${f('ESTADO DO APARELHO','<input id="condition" placeholder="USADO / ARRANHADO / ...">')}
            ${f('ACESSÓRIOS','<input id="accessories" placeholder="SEM ACESSÓRIOS">')}
            ${f('TIPO DE ATENDIMENTO','<select id="serviceType"><option>INTERNO</option><option>EXTERNO</option></select>')}
            ${f('LOCAL DO PRODUTO','<select id="productLocation"><option>LABORATORIO</option><option>CONSUMIDOR</option></select>')}
            ${f('DEFEITO RELATADO *','<textarea id="reported" required></textarea>','wide')}
          </div>
          <input id="notes" type="hidden" value="">
          <button type="button" class="vx-newos-f11" id="newNotesBtn">F11 – OBSERVAÇÕES INTERNAS</button>
          <div class="vx-newos-hint"><b>PADRÃO DE LOCALIZAÇÃO:</b> estes campos ficam nas mesmas posições usadas depois na consulta da OS. Após salvar, Orçamento, Fotos/Anexos, Financeiro e Histórico são liberados dentro da própria OS.</div>
        </div>
      </div>
      <div class="vx-newos-actions"><button type="button" class="cancel" onclick="render('os')">CANCELAR</button><button class="save" type="submit">SALVAR OS</button><button type="button" class="advance" id="saveAdvance">SALVAR E AVANÇAR</button></div>
      </section>
    </form>
    <div id="newNotesModal" class="vx-newos-modal hidden"><div class="vx-newos-modal-card"><h3>F11 – OBSERVAÇÕES INTERNAS</h3><p style="font-size:11px;color:#607185">Conteúdo interno. Não será impresso nos documentos do cliente.</p><textarea id="newNotesText"></textarea><div class="vx-newos-modal-actions"><button type="button" class="cancel" id="newNotesCancel">CANCELAR</button><button type="button" class="save" id="newNotesSave">SALVAR OBSERVAÇÃO</button></div></div></div>`;

    applyUppercase();
    const client=document.querySelector('#clientId'),sum=document.querySelector('#newClientSummary');
    const updateClient=()=>{const c=state.clients.find(x=>x.id===client.value);sum.innerHTML=c?`<b>${esc(c.name||'')}</b><br>CPF/CNPJ: ${esc(c.document||'—')}<br>Telefone: ${esc(c.phone_primary||'—')}${c.phone_secondary?` • ${esc(c.phone_secondary)}`:''}<br>E-mail: ${esc(c.email||'—')}`:'Selecione um cliente para visualizar os dados principais.'};
    client.onchange=updateClient;
    document.querySelector('#quickClient').onclick=async()=>{await quickClient();setTimeout(()=>{client.innerHTML='<option value="">SELECIONE...</option>'+clientOptionsNew();},50)};
    const group=document.querySelector('#productGroup'),type=document.querySelector('#productType');
    const infer=t=>{t=up(t);if(t.includes('TV'))return'TV';if(/REFRIG|FREEZER|AR-COND|GELADEIRA/.test(t))return'REFRIGERAÇÃO';if(/MICRO|FOG|LAVA|BEBED/.test(t))return'LINHA BRANCA';if(/AUDIO|SOM/.test(t))return'ÁUDIO';return t?'GERAL':''};type.oninput=()=>{group.value=infer(type.value)};
    document.querySelectorAll('.vx-newos-tabs button[data-focus]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.vx-newos-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelector('#'+b.dataset.focus)?.focus();});
    const modal=document.querySelector('#newNotesModal'),noteText=document.querySelector('#newNotesText'),noteHidden=document.querySelector('#notes');
    const openNotes=()=>{noteText.value=noteHidden.value||'';modal.classList.remove('hidden');noteText.focus()};
    document.querySelector('#newNotesBtn').onclick=openNotes;document.querySelector('#newNotesCancel').onclick=()=>modal.classList.add('hidden');document.querySelector('#newNotesSave').onclick=()=>{noteHidden.value=up(noteText.value);modal.classList.add('hidden');toast('Observação interna preparada para salvar com a OS.')};
    document.querySelector('#osForm').onsubmit=e=>saveNewOs(e,false);document.querySelector('#saveAdvance').onclick=e=>saveNewOs(e,true);
  };
})();
