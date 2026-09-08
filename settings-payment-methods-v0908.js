/* VoxAssist Web V0.9.08 — Configurações > Financeiro > Formas de pagamento.
   Matriz Mestra, Área 06 -- CRIAR confirmado: "forma de pagamento" era
   uma lista fixa dentro de os-detail-v0812.js (financePanel(), guia
   Finalizar OS), sem tabela nem tela de gestão. Diferente do catálogo
   de produtos (global, compartilhado): forma de pagamento é POR
   EMPRESA de verdade -- tabela nova (payment_methods, migration
   20260908040000), mesmo padrão de service_groups/stores.
   "DESCONTO" é tratado como caso especial no frontend (fecha o saldo
   da OS sem contar como receita, ver financePanel()/dashboard-
   canonical-v1.js) -- comparação é pelo NOME em maiúsculas, não uma
   flag na tabela; renomear/excluir esse registro quebra esse
   comportamento (aviso deixado na tela).
   Página própria (não empilhada na tela de Empresa & Usuários) --
   acessada pelo hub de Configurações (settings-hub-v0908.js), card
   "FINANCEIRO". */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;

  window.renderFinanceiroSettings=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML='<div class="card">Carregando formas de pagamento...</div>';
    const methods=cid?await api(`payment_methods?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Financeiro</h2><p>Formas de pagamento desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxFinBack">← Voltar</button></div></div>
      <section class="vx-admin-card">
        <div class="vx-admin-title"><h3>FORMAS DE PAGAMENTO</h3><span>${methods.length}</span></div>
        <p class="vx-sg-help">Usadas na guia FINALIZAR OS de cada ordem de serviço. <b>DESCONTO</b> é uma forma especial -- fecha o saldo da OS sem contar como receita nos relatórios; renomear ou desativar esse item específico muda esse comportamento.</p>
        <div class="vx-sg-list" id="vxPayMethodsList"></div>
        <button type="button" class="secondary" id="vxPayMethodNew">+ Nova forma de pagamento</button>
      </section>
    </div>`;
    document.getElementById('vxFinBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderList(methods);
    document.getElementById('vxPayMethodNew').onclick=()=>openModal(null);
  };

  function renderList(methods){
    const host=document.getElementById('vxPayMethodsList');if(!host)return;
    host.innerHTML=methods.length?methods.map(m=>`<div class="vx-sg-row${m.active?'':' inactive'}"><b>${E(m.name)}</b><span>${m.active?'ATIVA':'INATIVA'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(m.id)}">Renomear</button><button type="button" data-toggle="${E(m.id)}" data-active="${m.active?'1':'0'}">${m.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma forma de pagamento cadastrada ainda.</p>';
    host.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const m=methods.find(x=>String(x.id)===b.dataset.rename);
      if(m)openModal(m);
    });
    host.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const m=methods.find(x=>String(x.id)===b.dataset.toggle);if(!m)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_payment_method',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:m.id,p_name:m.name,p_active:!m.active})});
        toast?.(m.active?'Forma de pagamento desativada.':'Forma de pagamento ativada.');
        await window.renderFinanceiroSettings();
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
  }

  function openModal(method){
    document.querySelector('#vxPayMethodModal')?.remove();
    const ov=document.createElement('div');ov.id='vxPayMethodModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${method?'Renomear forma de pagamento':'Nova forma de pagamento'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxPayMethodForm" class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="40" value="${method?E(method.name):''}" placeholder="EX.: BOLETO, VALE, CASHBACK"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_payment_method',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:method?.id||null,p_name:String(f.get('name')).trim(),p_active:method?method.active:true})});
        ov.remove();
        toast?.(method?'Forma de pagamento atualizada.':'Forma de pagamento criada.');
        await window.renderFinanceiroSettings();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }
})();
