/* VoxAssist Web V0.9.08 — Configurações > Comunicação & Automação.
   Matriz Mestra, Área 07 -- "Mensagens padrão": CRIAR confirmado,
   nada existia (WhatsApp/chat sempre digitado na hora, nenhum texto
   reutilizável salvo). Migration 20260908100000, sem semeadura.
   Escopo desta etapa é só o CADASTRO do texto -- ligar isso a um
   botão de "usar modelo" dentro do chat/WhatsApp fica pra uma etapa
   futura; esta tabela não dispara nada, não toca em nenhuma rota de
   envio existente (regra da sessão: nunca mexer na arquitetura de
   sessão/QR/reconexão do WhatsApp sem necessidade explícita).
   Primeira tela real da Área 07 -- hub (settings-hub-v0908.js) sai
   de apontar pra 'admin' e passa a apontar pra 'comunicacao'. */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;

  window.renderCommunicationSettings=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Comunicação & Automação</h2><p>Mensagens padrão desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxCommBack">← Voltar</button></div></div>
      <section class="vx-admin-card" id="vxCommHoursCard"></section>
      <section class="vx-admin-card" id="vxMsgTemplatesCard" style="margin-top:12px"></section>
    </div>`;
    document.getElementById('vxCommBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderHoursNote();
    renderTemplates(cid);
  };

  function renderHoursNote(){
    const card=document.getElementById('vxCommHoursCard');if(!card)return;
    card.innerHTML=`<div class="vx-admin-title"><h3>HORÁRIO DE ATENDIMENTO</h3></div>
      <p class="vx-sg-help">Não existe um horário separado pra Comunicação -- é o mesmo horário de funcionamento da empresa (Agenda & Atendimento). Configurar/editar continua lá, sem duplicar aqui.</p>
      <button type="button" class="secondary" data-goto-agenda>Abrir Agenda & Atendimento</button>`;
    card.querySelector('[data-goto-agenda]').onclick=()=>{window.__vxConfigSection='admin';window.render('usuarios');};
  }

  async function renderTemplates(cid){
    const card=document.getElementById('vxMsgTemplatesCard');if(!card)return;
    const rows=cid?await api(`message_templates?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    card.innerHTML=`<div class="vx-admin-title"><h3>MENSAGENS PADRÃO</h3><span>${rows.length}</span></div>
      <p class="vx-sg-help">Textos reutilizáveis pra WhatsApp/chat. "Disparo automático" sugere a mensagem (com confirmação humana antes de enviar) quando a OS muda pro status marcado -- nunca envia sozinho.</p>
      <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row${r.active?'':' inactive'}"><b>${E(r.name)}${r.trigger_event?' ⚡':''}</b><span>${r.trigger_event?TRIGGER_LABELS[r.trigger_event]+' · ':''}${r.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-edit="${E(r.id)}">Editar</button><button type="button" data-toggle="${E(r.id)}">${r.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma mensagem cadastrada ainda.</p>'}</div>
      <button type="button" class="secondary" data-new>+ Nova mensagem</button>`;
    card.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const r=rows.find(x=>String(x.id)===b.dataset.edit);
      if(r)openModal(cid,r);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const r=rows.find(x=>String(x.id)===b.dataset.toggle);if(!r)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_message_template',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:r.id,p_name:r.name,p_body:r.body,p_active:!r.active,p_trigger_event:r.trigger_event||null})});
        toast?.(r.active?'Desativado.':'Ativado.');
        await renderTemplates(cid);
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
    card.querySelector('[data-new]').onclick=()=>openModal(cid,null);
  }

  const TRIGGER_LABELS={OS_PRONTO_PARA_ENTREGA:'Equipamento pronto para entrega'};

  function openModal(cid,item){
    document.querySelector('#vxMsgTemplateModal')?.remove();
    const ov=document.createElement('div');ov.id='vxMsgTemplateModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${item?'Editar mensagem':'Nova mensagem'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form">
      <label>NOME *</label><input name="name" required maxlength="60" value="${item?E(item.name):''}" placeholder="EX.: ORÇAMENTO PRONTO, EQUIPAMENTO PRONTO">
      <label>TEXTO</label><textarea name="body" rows="6" placeholder="Texto da mensagem... use {cliente} para o nome do cliente">${item?E(item.body):''}</textarea>
      <label>DISPARO AUTOMÁTICO (sugestão, com confirmação antes de enviar)</label><select name="trigger_event"><option value="">Nenhum -- só uso manual</option>${Object.entries(TRIGGER_LABELS).map(([v,l])=>`<option value="${v}" ${item?.trigger_event===v?'selected':''}>${l}</option>`).join('')}</select>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_message_template',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:item?.id||null,p_name:String(f.get('name')).trim(),p_body:String(f.get('body')||''),p_active:item?item.active:true,p_trigger_event:f.get('trigger_event')||null})});
        ov.remove();
        toast?.(item?'Atualizado.':'Criado.');
        await renderTemplates(cid);
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }
})();
