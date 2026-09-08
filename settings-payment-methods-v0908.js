/* VoxAssist Web V0.9.08 — Configurações > Financeiro.
   Matriz Mestra, Área 06.
   FORMAS DE PAGAMENTO -- CRIAR confirmado: era uma lista fixa dentro de
   os-detail-v0812.js (financePanel(), guia Finalizar OS), sem tabela
   nem tela de gestão. Diferente do catálogo de produtos (global,
   compartilhado): forma de pagamento é POR EMPRESA de verdade --
   tabela payment_methods (migration 20260908040000), mesmo padrão de
   service_groups/stores.
   "DESCONTO" é tratado como caso especial no frontend (fecha o saldo
   da OS sem contar como receita, ver financePanel()/dashboard-
   canonical-v1.js) -- comparação é pelo NOME em maiúsculas, não uma
   flag na tabela; renomear/excluir esse registro quebra esse
   comportamento (aviso deixado na tela).
   CONTAS E CAIXAS / CATEGORIAS FINANCEIRAS -- CRIAR confirmado: nenhum
   dos dois existia (nem tabela nem tela), sem semeadura necessária
   (migration 20260908090000). Escopo desta etapa é só o CADASTRO --
   ligar pagamento a uma conta/categoria específica fica pra depois.
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
    app.innerHTML='<div class="card">Carregando Financeiro...</div>';
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Financeiro</h2><p>Formas de pagamento, contas e categorias desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxFinBack">← Voltar</button></div></div>
      <section class="vx-admin-card" id="vxPayMethodsCard"></section>
      <section class="vx-admin-card" id="vxCashAccountsCard" style="margin-top:12px"></section>
      <section class="vx-admin-card" id="vxFinCategoriesCard" style="margin-top:12px"></section>
      <section class="vx-admin-card" id="vxFinParamsCard" style="margin-top:12px"></section>
      <section class="vx-admin-card" id="vxDiscountLimitsCard" style="margin-top:12px"></section>
    </div>`;
    document.getElementById('vxFinBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderPayMethods(cid);
    CASH_ACCOUNTS.render(cid);
    FIN_CATEGORIES.render(cid);
    renderFinParams(cid);
    renderDiscountLimits(cid);
  };

  const DISCOUNT_ROLES=[['GESTOR','Gestor'],['ATENDENTE','Atendente'],['TECNICO','Técnico']];

  async function renderDiscountLimits(cid){
    const card=document.getElementById('vxDiscountLimitsCard');if(!card)return;
    const rows=cid?await api(`discount_limits?company_id=eq.${cid}&select=role,max_percent`).catch(()=>[]):[];
    const byRole=Object.fromEntries(rows.map(r=>[r.role,r.max_percent]));
    card.innerHTML=`<div class="vx-admin-title"><h3>LIMITE DE DESCONTO POR PERFIL</h3></div>
      <p class="vx-sg-help">Limite percentual de desconto por perfil. Cadastro apenas -- ainda não validado quando a forma DESCONTO é lançada na guia Finalizar OS.</p>
      <div class="vx-sg-list">${DISCOUNT_ROLES.map(([role,label])=>`<div class="vx-sg-row"><b>${label}</b><span><input data-role="${role}" type="number" min="0" max="100" step="0.1" style="width:70px;height:28px;border:1px solid #cfd9e3;border-radius:6px;padding:0 6px" value="${byRole[role]??''}" placeholder="SEM LIMITE"> %</span></div>`).join('')}</div>
      <button type="button" class="secondary" data-save>SALVAR LIMITES</button>`;
    card.querySelector('[data-save]').onclick=async()=>{
      const btn=card.querySelector('[data-save]');btn.disabled=true;
      try{
        for(const [role] of DISCOUNT_ROLES){
          const input=card.querySelector(`[data-role="${role}"]`);
          const v=input.value;
          await api('rpc/admin_set_discount_limit',{method:'POST',body:JSON.stringify({p_company_id:cid,p_role:role,p_max_percent:v?Number(v):null})});
        }
        toast?.('Limites de desconto salvos.');
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');}
      btn.disabled=false;
    };
  }

  const ROUNDING_LABELS={NENHUM:'NENHUM',PARA_CIMA:'PARA CIMA',PARA_BAIXO:'PARA BAIXO',MAIS_PROXIMO:'MAIS PRÓXIMO'};

  async function renderFinParams(cid){
    const card=document.getElementById('vxFinParamsCard');if(!card)return;
    const rows=cid?await api(`companies?id=eq.${cid}&select=finance_interest_rate_monthly,finance_fine_rate,finance_rounding_mode`).catch(()=>[]):[];
    const c=rows?.[0]||{};
    card.innerHTML=`<div class="vx-admin-title"><h3>PARÂMETROS FINANCEIROS</h3></div>
      <p class="vx-sg-help">Juros, multa e arredondamento. Cadastro apenas -- ainda não aplicados em nenhum cálculo da guia Finalizar OS.</p>
      <form id="vxFinParamsForm" class="vx-admin-form">
        <label>JUROS AO MÊS (%)</label><input name="interest" type="number" step="0.01" min="0" value="${c.finance_interest_rate_monthly??''}" placeholder="EX.: 2.5">
        <label>MULTA POR ATRASO (%)</label><input name="fine" type="number" step="0.01" min="0" value="${c.finance_fine_rate??''}" placeholder="EX.: 2">
        <label>ARREDONDAMENTO</label><select name="rounding">${Object.entries(ROUNDING_LABELS).map(([v,l])=>`<option value="${v}"${c.finance_rounding_mode===v?' selected':''}>${l}</option>`).join('')}</select>
        <div class="vx-admin-form-actions"><button class="primary">SALVAR</button></div>
      </form>`;
    card.querySelector('#vxFinParamsForm').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        const interest=f.get('interest'),fine=f.get('fine');
        await api(`companies?id=eq.${cid}`,{method:'PATCH',body:JSON.stringify({
          finance_interest_rate_monthly:interest?Number(interest):null,
          finance_fine_rate:fine?Number(fine):null,
          finance_rounding_mode:f.get('rounding')||'NENHUM'
        })});
        toast?.('Parâmetros financeiros salvos.');
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');}
      btn.disabled=false;
    };
  }

  async function renderPayMethods(cid){
    const card=document.getElementById('vxPayMethodsCard');if(!card)return;
    const methods=cid?await api(`payment_methods?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    card.innerHTML=`<div class="vx-admin-title"><h3>FORMAS DE PAGAMENTO</h3><span>${methods.length}</span></div>
      <p class="vx-sg-help">Usadas na guia FINALIZAR OS de cada ordem de serviço. <b>DESCONTO</b> é uma forma especial -- fecha o saldo da OS sem contar como receita nos relatórios; renomear ou desativar esse item específico muda esse comportamento. Limite de parcelas é cadastro apenas -- ainda não validado no formulário.</p>
      <div class="vx-sg-list" id="vxPayMethodsList">${methods.length?methods.map(m=>`<div class="vx-sg-row${m.active?'':' inactive'}"><b>${E(m.name)}</b><span>${m.max_installments?'ATÉ '+m.max_installments+'X · ':''}${m.active?'ATIVA':'INATIVA'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(m.id)}">Renomear</button><button type="button" data-toggle="${E(m.id)}">${m.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma forma de pagamento cadastrada ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxPayMethodNew">+ Nova forma de pagamento</button>`;
    card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const m=methods.find(x=>String(x.id)===b.dataset.rename);
      if(m)openPayMethodModal(cid,m);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const m=methods.find(x=>String(x.id)===b.dataset.toggle);if(!m)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_payment_method',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:m.id,p_name:m.name,p_active:!m.active,p_max_installments:m.max_installments})});
        toast?.(m.active?'Forma de pagamento desativada.':'Forma de pagamento ativada.');
        await renderPayMethods(cid);
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
    document.getElementById('vxPayMethodNew').onclick=()=>openPayMethodModal(cid,null);
  }
  function openPayMethodModal(cid,method){
    document.querySelector('#vxPayMethodModal')?.remove();
    const ov=document.createElement('div');ov.id='vxPayMethodModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${method?'Renomear forma de pagamento':'Nova forma de pagamento'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxPayMethodForm" class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="40" value="${method?E(method.name):''}" placeholder="EX.: BOLETO, VALE, CASHBACK"><label>LIMITE DE PARCELAS (opcional)</label><input name="max_installments" type="number" min="1" value="${method?.max_installments??''}" placeholder="EX.: 12"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        const mi=f.get('max_installments');
        await api('rpc/admin_upsert_payment_method',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:method?.id||null,p_name:String(f.get('name')).trim(),p_active:method?method.active:true,p_max_installments:mi?Number(mi):null,p_clear_max_installments:!mi})});
        ov.remove();
        toast?.(method?'Forma de pagamento atualizada.':'Forma de pagamento criada.');
        await renderPayMethods(cid);
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }

  // Fábrica genérica pros catálogos simples (nome+ativo) -- Contas e
  // Caixas / Categorias Financeiras, mesma estrutura já usada em
  // settings-product-catalog-v0908.js.
  function simpleCatalogCard({cardId,table,rpc,title,help,placeholder,newLabel}){
    async function render(cid){
      const card=document.getElementById(cardId);if(!card)return;
      const rows=cid?await api(`${table}?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
      card.innerHTML=`<div class="vx-admin-title"><h3>${title}</h3><span>${rows.length}</span></div>
        <p class="vx-sg-help">${help}</p>
        <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row${r.active?'':' inactive'}"><b>${E(r.name)}</b><span>${r.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(r.id)}">Renomear</button><button type="button" data-toggle="${E(r.id)}">${r.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nada cadastrado ainda.</p>'}</div>
        <button type="button" class="secondary" data-new>${newLabel}</button>`;
      card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
        const r=rows.find(x=>String(x.id)===b.dataset.rename);
        if(r)openModal(cid,r);
      });
      card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
        const r=rows.find(x=>String(x.id)===b.dataset.toggle);if(!r)return;
        b.disabled=true;
        try{
          await api(`rpc/${rpc}`,{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:r.id,p_name:r.name,p_active:!r.active})});
          toast?.(r.active?'Desativado.':'Ativado.');
          await render(cid);
        }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
      });
      card.querySelector('[data-new]').onclick=()=>openModal(cid,null);
    }
    function openModal(cid,item){
      const modalId=cardId+'Modal';
      document.querySelector('#'+modalId)?.remove();
      const ov=document.createElement('div');ov.id=modalId;ov.className='vx-admin-overlay';
      ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${item?'Renomear':'Novo item'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="60" value="${item?E(item.name):''}" placeholder="${placeholder}"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
      document.body.appendChild(ov);
      ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
      ov.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
        try{
          await api(`rpc/${rpc}`,{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:item?.id||null,p_name:String(f.get('name')).trim(),p_active:item?item.active:true})});
          ov.remove();
          toast?.(item?'Atualizado.':'Criado.');
          await render(cid);
        }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
      };
    }
    return {render};
  }

  const CASH_ACCOUNTS=simpleCatalogCard({cardId:'vxCashAccountsCard',table:'cash_accounts',rpc:'admin_upsert_cash_account',title:'CONTAS E CAIXAS',help:'Destinos financeiros usados pela empresa. Vincular um pagamento a uma conta específica fica pra uma etapa futura.',placeholder:'EX.: CAIXA SERRA, BANCO, PIX',newLabel:'+ Nova conta/caixa'});
  const FIN_CATEGORIES=simpleCatalogCard({cardId:'vxFinCategoriesCard',table:'financial_categories',rpc:'admin_upsert_financial_category',title:'CATEGORIAS FINANCEIRAS',help:'Categorias pra organizar lançamentos financeiros. Vincular um lançamento a uma categoria específica fica pra uma etapa futura.',placeholder:'EX.: SERVIÇO, PEÇA, VISITA, SINAL',newLabel:'+ Nova categoria'});
})();
