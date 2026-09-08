/* VoxAssist Web V0.9.08 — Configurações > Ordens de Serviço > Tipos de OS.
   Matriz Mestra, Área 02 -- CRIAR confirmado: "tipo de OS" era uma
   lista fixa (TYPES) dentro de order-type-v0812.js, sem tela de
   gestão. service_orders.order_type é texto livre (sem CHECK) --
   ativar/desativar aqui nunca afeta OS já criadas.
   Mesmo padrão de payment_methods: catálogo por empresa (migration
   20260908050000), GESTOR-only. "GARANTIA" e "REINGRESSO" têm
   comportamento especial hardcoded no frontend (order-type-v0812.js
   pede NF/data da compra/revendedor/prazo pra GARANTIA, vincula OS
   anterior pra REINGRESSO) -- comparação por string exata; renomear
   esses dois registros quebra esse comportamento (aviso na tela).
   Página própria, acessada pelo hub (settings-hub-v0908.js), card
   "ORDENS DE SERVIÇO". */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;
  const SPECIAL=new Set(['GARANTIA','REINGRESSO']);

  window.renderOsTypesSettings=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML='<div class="card">Carregando tipos de OS...</div>';
    const types=cid?await api(`order_types?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Ordens de Serviço</h2><p>Tipos de OS desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxOsTypesBack">← Voltar</button></div></div>
      <section class="vx-admin-card">
        <div class="vx-admin-title"><h3>TIPOS DE OS</h3><span>${types.length}</span></div>
        <p class="vx-sg-help">Usados no campo TIPO DE ORDEM DE SERVIÇO da Nova OS. <b>GARANTIA</b> e <b>REINGRESSO</b> são tipos especiais -- disparam campos extras (dados da garantia / vínculo com OS anterior); renomear ou desativar esses dois itens específicos muda esse comportamento.</p>
        <div class="vx-sg-list" id="vxOsTypesList"></div>
        <button type="button" class="secondary" id="vxOsTypeNew">+ Novo tipo de OS</button>
      </section>
      <section class="vx-admin-card" style="margin-top:12px">
        <div class="vx-admin-title"><h3>NUMERAÇÃO</h3></div>
        <p class="vx-sg-help">Regra fixa do sistema (não configurável por empresa): <code>DD + letra do mês + AA + letra da hora + MM</code>. Mês A=Jan...L=Dez. Hora A=08h...N=21h (fora desse intervalo, "Z"). Exemplo: 02/09/2026 14:35 → <b>02I26G35</b>.</p>
      </section>
      <section class="vx-admin-card" style="margin-top:12px">
        <div class="vx-admin-title"><h3>CAMPOS OBRIGATÓRIOS POR ETAPA</h3></div>
        <p class="vx-sg-help">Regra fixa do motor de status (não configurável por empresa) -- o que falta preencher pra cada etapa avançar sozinha pra próxima:</p>
        <div class="vx-sg-list">
          <div class="vx-sg-row"><b>Aguardando Análise</b><span>Técnico, defeito constatado, serviço, valor do orçamento/peças</span></div>
          <div class="vx-sg-row"><b>Aguardando Aprovação</b><span>Decisão (Aprovado/Recusado), data da aprovação ou motivo da recusa</span></div>
          <div class="vx-sg-row"><b>Aguardando Conserto</b><span>Data/hora de início do conserto</span></div>
          <div class="vx-sg-row"><b>Em Conserto</b><span>Data/hora de pronto</span></div>
          <div class="vx-sg-row"><b>Pronto para Entrega</b><span>Data/hora de entrega/saída</span></div>
          <div class="vx-sg-row"><b>Orçamento Recusado</b><span>Equipamento preparado/remontado (pronto para retirada)</span></div>
        </div>
      </section>
    </div>`;
    document.getElementById('vxOsTypesBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderList(types);
    document.getElementById('vxOsTypeNew').onclick=()=>openModal(null);
  };

  function renderList(types){
    const host=document.getElementById('vxOsTypesList');if(!host)return;
    host.innerHTML=types.length?types.map(t=>`<div class="vx-sg-row${t.active?'':' inactive'}"><b>${E(t.name)}${SPECIAL.has(String(t.name).toUpperCase())?' ⚑':''}</b><span>${t.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(t.id)}">Renomear</button><button type="button" data-toggle="${E(t.id)}" data-active="${t.active?'1':'0'}">${t.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum tipo de OS cadastrado ainda.</p>';
    host.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const t=types.find(x=>String(x.id)===b.dataset.rename);
      if(t)openModal(t);
    });
    host.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const t=types.find(x=>String(x.id)===b.dataset.toggle);if(!t)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_order_type',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:t.id,p_name:t.name,p_active:!t.active})});
        toast?.(t.active?'Tipo de OS desativado.':'Tipo de OS ativado.');
        await window.renderOsTypesSettings();
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
  }

  function openModal(type){
    document.querySelector('#vxOsTypeModal')?.remove();
    const ov=document.createElement('div');ov.id='vxOsTypeModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${type?'Renomear tipo de OS':'Novo tipo de OS'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxOsTypeForm" class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="40" value="${type?E(type.name):''}" placeholder="EX.: FABRICANTE, RECALL">${type&&SPECIAL.has(String(type.name).toUpperCase())?'<p style="font-size:10px;color:#a35b00">⚑ Este tipo tem comportamento especial no formulário de Nova OS -- renomear muda esse comportamento.</p>':''}<div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_order_type',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:type?.id||null,p_name:String(f.get('name')).trim(),p_active:type?type.active:true})});
        ov.remove();
        toast?.(type?'Tipo de OS atualizado.':'Tipo de OS criado.');
        await window.renderOsTypesSettings();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }
})();
