/* VoxAssist — Dashboard Canônico V1
 * Fonte única do Dashboard. Não altera login, shell, abas, OS ou demais módulos.
 * Sem MutationObserver, sem sobrescritas encadeadas, sem números fictícios.
 *
 * Reconstrução (2026-09-01) pra reproduzir fielmente a referência visual
 * aprovada (screenshot real do usuário): ordem indicadores -> Casos de
 * Atenção/Oportunidades -> Gestão Visual -> Tarefas/Peças/Gestão por
 * Exceção -> Feed/Produtividade -> Metas/Resumo Financeiro -> Minha
 * Agenda (5 dias). Tudo derivado de tabelas/colunas reais já existentes
 * -- nenhuma tabela nova, nenhum valor fictício. Onde a referência pede
 * algo sem base real persistida (Metas e Bonificação), mantém "Não
 * configurado" -- regra explícita já dada pelo usuário nesta sessão.
 *
 * Achados/decisões de derivação, documentados porque a fonte não é
 * 1:1 óbvia. Referência visual = só composição/densidade/estilo; NUNCA
 * números, rótulos ou vocabulário de status copiados da imagem -- fonte
 * de verdade é sempre schema real + funcionalidade já aprovada:
 * - dashboard_cases.status: sem CHECK constraint no schema (só o default
 *   'NOVO' é garantido), mas o usuário confirmou em 2026-09-01 que o
 *   vocabulário real esperado é exatamente NOVO/EM ANDAMENTO/RESOLVIDO
 *   -- confirmação explícita do usuário, não suposição a partir da
 *   imagem de referência. Os 3 contadores do card são escopados aos
 *   últimos 30 dias (via created_at); o drill-down "Ver todos os
 *   casos" continua mostrando todos os casos em aberto, sem esse corte.
 * - parts_requests.status: mesma situação (sem CHECK constraint, nenhum
 *   outro código escreve nessa tabela). Uso só a contagem total (igual
 *   ao Dashboard original) e "Atrasados" via expected_date (data real,
 *   independente do texto do status) -- nunca uma quebra por
 *   PENDENTE/EM COMPRA/AGUARDANDO ENTREGA, que não tem base real.
 * - "Orçamentos (Mês)"/"Entregues (Mês)": contados via os_status_history
 *   (mudanças de status reais, com changed_at), não por opened_at/
 *   updated_at da OS -- é a única forma correta de saber QUANDO uma OS
 *   entrou em AGUARDANDO APROVACAO/FINALIZADA.
 */
(function(){
  'use strict';
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const M=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const role=()=>norm(state?.profile?.role||'GESTOR');
  const me=()=>state?.profile?.id;
  const age=o=>Math.max(0,Math.floor((Date.now()-new Date(o.updated_at||o.opened_at||Date.now()).getTime())/86400000));
  const isOpen=o=>!['FINALIZADA','CANCELADA'].includes(norm(o.status));
  const safe=x=>Array.isArray(x)?x:[];
  // Achado do usuário em 2026-09-02: ATENDENTE via um número diferente
  // de GESTOR pro mesmo KPI (ex.: "OS Ativas") -- a empresa é a mesma,
  // o número deveria ser o mesmo. Confirmado com o usuário: os
  // indicadores do Dashboard são da empresa inteira pra todo mundo,
  // sem escopo por atendente -- só a Agenda (tela própria, já filtrada
  // por técnico) e o TÉCNICO continuam vendo só o que é deles, pra não
  // confundir quem só deveria agir no que é seu.
  const scope=rows=>role()==='TECNICO'?rows.filter(o=>o.technician_id===me()):rows;
  // Achado do usuário em 2026-09-03: faltava somar as peças do
  // orçamento (os_parts) -- só mão de obra/frete/material/laudo/
  // desconto entravam aqui, subestimando todo valor de OS com peça
  // lançada. partsTotal é opcional (0 por padrão) só pra não quebrar
  // quem já chama budget() sem essa informação disponível.
  const budget=(f,partsTotal=0)=>Math.max(0,Number(partsTotal||0)+Number(f?.labor_value||0)+Number(f?.freight_value||0)+Number(f?.auxiliary_material_value||0)+Number(f?.technical_report_value||0)-Number(f?.discount_value||0));
  const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const withTimeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error(label+' excedeu '+ms+'ms')),ms))]);
  const pct=(part,total)=>total>0?Math.round((part/total)*100):0;

  async function source(label,path,fallback=[]){
    try{return {label,ok:true,data:await withTimeout(api(path),7000,label)}}catch(error){return {label,ok:false,data:fallback,error}}
  }

  function modal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Dias</th></tr></thead><tbody>${rows.map(o=>`<tr data-os="${E(o.id)}"><td><b>${E(o.os_number||'—')}</b></td><td>${E(o.clients?.name||'—')}</td><td>${E([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${E(norm(o.status)||'—')}</td><td>${age(o)}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
    bg.querySelectorAll('[data-os]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.os;bg.remove();if(typeof window.render==='function')window.render('os:'+id);else if(typeof render==='function')render('os:'+id);});
  }

  // Achado do usuário em 2026-09-03: os cards "Casos de Atenção" abriam
  // este modal, mas as linhas não tinham nenhum jeito de ver o caso ou
  // chegar na OS vinculada (sem onclick nenhum) -- ao contrário de
  // modal(), que já linka pra OS via [data-os]. Corrigido: mesma
  // navegação, quando o caso tem service_order_id.
  // Bug real corrigido em 2026-09-03 (achado via console do usuário):
  // esta função vive no escopo do módulo (irmã de renderDashboard, não
  // dentro dela), mas usava "ordersById" como se fosse variável global
  // -- é um const LOCAL de renderDashboard, então todo clique lançava
  // ReferenceError e o modal nunca chegava a abrir. Corrigido recebendo
  // ordersById como parâmetro (passado pelo dispatcher, que está no
  // mesmo escopo de renderDashboard e por isso enxerga a variável).
  function casesModal(title,rows,ordersById=new Map()){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Caso</th><th>O.S.</th><th>Prioridade</th><th>Situação</th><th>Aberto em</th></tr></thead><tbody>${rows.map(c=>{const linkedOs=c.service_order_id?ordersById.get(String(c.service_order_id)):null;return `<tr data-case="${E(c.id)}" class="vx-c-row-clickable"><td><b>${E(c.title)}</b>${c.message?`<br><small>${E(c.message)}</small>`:''}</td><td>${linkedOs?E(linkedOs.os_number||'—'):'—'}</td><td>${E(norm(c.priority)||'—')}</td><td>${E(norm(c.status)||'—')}</td><td>${new Date(c.created_at).toLocaleDateString('pt-BR')}</td></tr>`}).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
    bg.querySelectorAll('tr[data-case]').forEach(tr=>tr.onclick=()=>{const c=rows.find(x=>String(x.id)===tr.dataset.case);bg.remove();if(c)caseDetailModal(c,ordersById);});
  }

  // Achado do usuário em 2026-09-03: o modal de casos era só leitura --
  // pediu pra dar pra ver mais dados, responder (comentar) e encaminhar
  // (reatribuir) sem sair do popup. dashboard_case_comments é uma
  // tabela nova (migration 20260903070000), append-only, mistura
  // comentário de verdade (event_type='COMENTARIO') com eventos de
  // sistema (REASSIGN/STATUS_CHANGE, com previous_data/new_data) num
  // fio só. Esta função é IRMÃ de renderDashboard (mesmo escopo de
  // módulo de casesModal) -- só usa parâmetros e o que já é global no
  // arquivo (E/norm/role/me/api/toast/state), nunca uma variável local
  // de renderDashboard (foi exatamente esse erro que quebrou o clique
  // dos casos antes).
  const CASE_TYPES={INFO:['🚩','Informação importante'],RECLAMACAO:['⚠','Reclamação do cliente'],ATRASO:['⏰','Atraso no atendimento'],CANCELAMENTO:['🔁','Risco de cancelamento'],FINANCEIRO:['💰','Pendência financeira'],OUTRO:['📌','Outro']};
  const CASE_PRIORITY_LABEL={ALTA:'Alta',MEDIA:'Média',BAIXA:'Baixa',NORMAL:'Normal',URGENTE:'Urgente'};
  const CASE_STATUS_LABEL={NOVO:'Novo',['EM ANDAMENTO']:'Em andamento',RESOLVIDO:'Resolvido',CANCELADO:'Cancelado'};
  const CASE_NEXT_ACTIONS={NOVO:[['EM ANDAMENTO','▶ Marcar em andamento'],['CANCELADO','✕ Cancelar']],['EM ANDAMENTO']:[['RESOLVIDO','✓ Marcar resolvido'],['CANCELADO','✕ Cancelar']],RESOLVIDO:[['EM ANDAMENTO','↺ Reabrir']],CANCELADO:[['EM ANDAMENTO','↺ Reabrir']]};
  let caseProfilesCache=null;
  async function caseProfilesList(){
    if(caseProfilesCache)return caseProfilesCache;
    caseProfilesCache=await api('profiles?select=id,full_name&active=eq.true&order=full_name').catch(()=>[]);
    return caseProfilesCache;
  }
  async function caseDetailModal(c,ordersById){
    document.querySelector('#vxCaseDetailModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCaseDetailModal';bg.className='vx-c-modal-bg';
    const linkedOs=c.service_order_id?ordersById.get(String(c.service_order_id)):null;
    const typeInfo=CASE_TYPES[c.case_type]||null;
    const statusLabel=CASE_STATUS_LABEL[norm(c.status)]||norm(c.status)||'—';
    const priorityLabel=CASE_PRIORITY_LABEL[norm(c.priority)]||norm(c.priority)||'—';
    const [comments,profiles,clientName]=await Promise.all([
      api(`dashboard_case_comments?case_id=eq.${c.id}&select=*,profiles(full_name)&order=created_at.asc`).catch(()=>[]),
      caseProfilesList(),
      c.client_id&&!linkedOs?api(`clients?id=eq.${c.client_id}&select=name`).then(r=>r?.[0]?.name||null).catch(()=>null):Promise.resolve(null),
    ]);
    const linkLine=linkedOs?`<a href="#" data-open-os="${E(linkedOs.id)}">OS ${E(linkedOs.os_number)} →</a>`:(clientName?`<a href="#" data-open-client="${E(c.client_id)}">Cliente: ${E(clientName)} →</a>`:'—');
    bg.innerHTML=`<div class="vx-c-modal vx-c-case-detail">
      <div class="vx-c-modal-head">
        <div><strong>${typeInfo?typeInfo[0]+' ':''}${E(c.title)}</strong><small>${typeInfo?E(typeInfo[1]):'Caso de atenção'}</small></div>
        <button type="button" data-close>×</button>
      </div>
      <div class="vx-c-modal-body vx-c-case-detail-body">
        <div class="vx-c-case-meta">
          <span class="vx-c-case-pill priority-${E(norm(c.priority)).toLowerCase()}">${E(priorityLabel)} prioridade</span>
          <span class="vx-c-case-pill status-${E(norm(c.status)).toLowerCase().replace(/\s+/g,'-')}">${E(statusLabel)}</span>
          <span class="vx-c-case-meta-item">Aberto por ${E(profiles.find(p=>String(p.id)===String(c.created_by))?.full_name||'—')} em ${new Date(c.created_at).toLocaleString('pt-BR')}</span>
          <span class="vx-c-case-meta-item">${linkLine}</span>
        </div>
        ${c.message?`<p class="vx-c-case-desc">${E(c.message)}</p>`:''}
        <div class="vx-c-case-actions">
          ${(CASE_NEXT_ACTIONS[norm(c.status)]||[]).map(([next,label])=>`<button type="button" class="vx-c-case-action-btn" data-status="${E(next)}">${label}</button>`).join('')}
          <span class="vx-c-case-assign"><select id="vxCaseAssignSelect"><option value="">Atribuir a…</option>${profiles.map(p=>`<option value="${E(p.id)}" ${String(c.assigned_to)===String(p.id)?'selected':''}>${E(p.full_name)}</option>`).join('')}</select><button type="button" id="vxCaseAssignBtn">Encaminhar</button></span>
        </div>
        <div class="vx-c-case-thread" id="vxCaseThread">${comments.length?comments.map(caseThreadRow).join(''):'<div class="vx-c-case-thread-empty">Nenhum comentário ainda.</div>'}</div>
        <div class="vx-c-case-reply"><textarea id="vxCaseReplyText" placeholder="Escrever uma resposta…" rows="2"></textarea><button type="button" id="vxCaseReplyBtn">Responder</button></div>
      </div>
    </div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-close]').onclick=close;
    bg.onclick=e=>{if(e.target===bg)close();};
    bg.querySelector('[data-open-os]')?.addEventListener('click',e=>{e.preventDefault();close();(window.render||render)('os:'+linkedOs.id);});
    bg.querySelector('[data-open-client]')?.addEventListener('click',e=>{e.preventDefault();close();(window.render||render)('cliente:'+c.client_id);});
    async function logAndRefresh(eventType,previousData,newData){
      await api('dashboard_case_comments',{method:'POST',body:JSON.stringify({case_id:c.id,company_id:c.company_id,event_type:eventType,previous_data:previousData,new_data:newData,created_by:me()})}).catch(()=>{});
      close();
      window.renderDashboard?.();
    }
    bg.querySelectorAll('[data-status]').forEach(btn=>btn.onclick=async()=>{
      const next=btn.dataset.status;btn.disabled=true;
      try{
        await api(`dashboard_cases?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:next,updated_at:new Date().toISOString()})});
        await logAndRefresh('STATUS_CHANGE',{status:c.status},{status:next});
        toast?.('Situação do caso alterada para '+(CASE_STATUS_LABEL[next]||next)+'.');
      }catch(err){toast?.('Não foi possível alterar a situação: '+err.message,'err');btn.disabled=false;}
    });
    bg.querySelector('#vxCaseAssignBtn').onclick=async()=>{
      const sel=bg.querySelector('#vxCaseAssignSelect');const newId=sel.value;
      if(!newId){toast?.('Selecione alguém pra encaminhar.','err');return;}
      const btn=bg.querySelector('#vxCaseAssignBtn');btn.disabled=true;
      try{
        await api(`dashboard_cases?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({assigned_to:newId,updated_at:new Date().toISOString()})});
        const newName=profiles.find(p=>String(p.id)===String(newId))?.full_name||'—';
        await logAndRefresh('REASSIGN',{assigned_to:c.assigned_to||null},{assigned_to:newId,assigned_to_name:newName});
        toast?.('Caso encaminhado para '+newName+'.');
      }catch(err){toast?.('Não foi possível encaminhar o caso: '+err.message,'err');btn.disabled=false;}
    };
    bg.querySelector('#vxCaseReplyBtn').onclick=async()=>{
      const ta=bg.querySelector('#vxCaseReplyText');const body=ta.value.trim();
      if(!body){toast?.('Escreva algo antes de responder.','err');return;}
      const btn=bg.querySelector('#vxCaseReplyBtn');btn.disabled=true;
      try{
        await api('dashboard_case_comments',{method:'POST',body:JSON.stringify({case_id:c.id,company_id:c.company_id,event_type:'COMENTARIO',body,created_by:me()})});
        ta.value='';
        const thread=bg.querySelector('#vxCaseThread');
        thread.querySelector('.vx-c-case-thread-empty')?.remove();
        thread.insertAdjacentHTML('beforeend',caseThreadRow({event_type:'COMENTARIO',body,created_at:new Date().toISOString(),profiles:{full_name:state?.profile?.full_name||'Você'}}));
        thread.scrollTop=thread.scrollHeight;
        btn.disabled=false;
      }catch(err){toast?.('Não foi possível enviar a resposta: '+err.message,'err');btn.disabled=false;}
    };
  }
  function caseThreadRow(m){
    const author=E(m.profiles?.full_name||'—');
    const when=new Date(m.created_at).toLocaleString('pt-BR');
    if(m.event_type==='COMENTARIO'||!m.event_type){
      return `<div class="vx-c-case-comment"><div class="vx-c-case-comment-head"><b>${author}</b><small>${when}</small></div><p>${E(m.body||'')}</p></div>`;
    }
    const detail=m.event_type==='REASSIGN'?`encaminhou para ${E(m.new_data?.assigned_to_name||'—')}`:m.event_type==='STATUS_CHANGE'?`mudou a situação para ${E(CASE_STATUS_LABEL[m.new_data?.status]||m.new_data?.status||'—')}`:m.event_type;
    return `<div class="vx-c-case-event"><small>${author} ${detail} • ${when}</small></div>`;
  }
  // "Meus Casos Enviados" (achado do usuário em 2026-09-04): linha
  // compacta pro card do Dashboard -- clique abre o mesmo
  // caseDetailModal de sempre (via dispatcher mycase:<id>, que já tem
  // myCases/ordersById no escopo de renderDashboard).
  function myCaseRow(c){
    const typeInfo=CASE_TYPES[c.case_type];
    const statusLabel=CASE_STATUS_LABEL[norm(c.status)]||norm(c.status)||'—';
    return `<button type="button" class="vx-c-mycase-row" data-drill="mycase:${E(c.id)}" data-title="${E(c.title)}"><span class="vx-c-mycase-ic">${typeInfo?typeInfo[0]:'📌'}</span><span class="vx-c-mycase-txt"><b>${E(c.title)}</b><small>${new Date(c.created_at).toLocaleDateString('pt-BR')}</small></span><span class="vx-c-case-pill status-${E(norm(c.status)).toLowerCase().replace(/\s+/g,'-')}">${E(statusLabel)}</span></button>`;
  }

  // Modal pra linhas de parts_requests (achado do usuário em
  // 2026-09-01: "Pedidos de Peças" não tinha como ver quais pedidos
  // reais estavam por trás de cada número -- mesmo problema do
  // Gestão Visual, mesma correção: linhas reais, não só a contagem).
  // Achado do usuário em 2026-09-04: o card "Pedidos de Peças" e este
  // drill-down eram só leitura -- não tinha como registrar a previsão
  // de chegada, ver quais estavam atrasados linha a linha, nem marcar
  // um pedido como recebido. Sem isso, os pedidos criados em
  // vxOpenSolicitarPecaModal (os-detail-v0812.js) nunca saíam de
  // "Solicitado" e os contadores Em compra/Aguardando entrega/
  // Atrasados/Recebidos hoje do card nunca mudavam. Vocabulário de
  // status alinhado 1:1 com os filtros já existentes (partsCompra
  // procura "COMPRA" no texto, partsEntrega procura "ENTREGA",
  // partsRecebidasHoje procura "RECEBID") -- optamos por estes 4
  // valores canônicos, sem CHECK constraint no schema pra permitir.
  const PARTS_STATUS_OPTIONS=['SOLICITADO','EM COMPRA','AGUARDANDO ENTREGA','RECEBIDO'];
  const partsIsLate=p=>!!p.expected_date&&new Date(p.expected_date)<new Date(new Date().toDateString())&&!norm(p.status).includes('RECEBID');
  function partsModal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    function statusOptions(p){
      const cur=norm(p.status);
      const opts=PARTS_STATUS_OPTIONS.includes(cur)?PARTS_STATUS_OPTIONS:[...PARTS_STATUS_OPTIONS,cur||'SOLICITADO'];
      return opts.map(s=>`<option value="${E(s)}"${cur===s?' selected':''}>${E(s.charAt(0)+s.slice(1).toLowerCase())}</option>`).join('');
    }
    function row(p){
      return `<tr data-row="${E(p.id)}"><td><b>${E(p.description||'—')}</b></td><td>${E(p.code||'—')}</td><td>${E(p.quantity||1)}</td><td>${E(p.supplier||'—')}</td>`
        +`<td><select class="vx-c-parts-status" data-id="${E(p.id)}">${statusOptions(p)}</select></td>`
        +`<td><input type="date" class="vx-c-parts-date" data-id="${E(p.id)}" value="${p.expected_date?String(p.expected_date).slice(0,10):''}"></td>`
        +`<td class="vx-c-parts-late-cell">${partsIsLate(p)?'<span class="vx-c-parts-late-badge">⚠ Atrasado</span>':''}</td></tr>`;
    }
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Peça</th><th>Código</th><th>Qtd</th><th>Fornecedor</th><th>Situação</th><th>Previsão</th><th>Atraso</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
    function refreshLate(tr,p){
      const cell=tr.querySelector('.vx-c-parts-late-cell');
      if(cell)cell.innerHTML=partsIsLate(p)?'<span class="vx-c-parts-late-badge">⚠ Atrasado</span>':'';
    }
    bg.querySelectorAll('.vx-c-parts-status').forEach(sel=>sel.onchange=async()=>{
      const id=sel.dataset.id,p=rows.find(r=>String(r.id)===String(id));if(!p)return;
      const tr=sel.closest('tr');sel.disabled=true;
      try{
        await api(`parts_requests?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:sel.value,updated_at:new Date().toISOString()})});
        p.status=sel.value;p.updated_at=new Date().toISOString();
        refreshLate(tr,p);
        toast?.('Situação do pedido atualizada.');
      }catch(err){toast?.('Não foi possível atualizar a situação: '+err.message,'err');}
      sel.disabled=false;
    });
    bg.querySelectorAll('.vx-c-parts-date').forEach(inp=>inp.onchange=async()=>{
      const id=inp.dataset.id,p=rows.find(r=>String(r.id)===String(id));if(!p)return;
      const tr=inp.closest('tr');inp.disabled=true;
      try{
        await api(`parts_requests?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({expected_date:inp.value||null})});
        p.expected_date=inp.value||null;
        refreshLate(tr,p);
        toast?.('Previsão de chegada atualizada.');
      }catch(err){toast?.('Não foi possível atualizar a previsão: '+err.message,'err');}
      inp.disabled=false;
    });
  }

  // Modal pra ver o histórico completo do Feed (achado do usuário em
  // 2026-09-01: "Ver tudo" não fazia nada -- o feed real vinha
  // truncado nas últimas 8 mudanças de status; aqui mostra tudo que
  // já foi buscado, sem esse corte).
  function feedModal(title,rows,feedTextFn){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Quando</th><th>Evento</th></tr></thead><tbody>${rows.map(h=>`<tr><td>${new Date(h.changed_at).toLocaleString('pt-BR')}</td><td>${E(feedTextFn(h))}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  // Modal pra linhas de tasks (achado do usuário em 2026-09-01: mesma
  // situação -- "Retornar clientes pendentes" não mostrava quais
  // tarefas reais).
  function tasksModal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Tarefa</th><th>Prioridade</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${E(t.title||'—')}</b></td><td>${E(norm(t.priority)||'—')}</td><td>${E(norm(t.status)||'—')}</td><td>${t.due_at?new Date(t.due_at).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  function orderValue(o,finMap){const direct=Number(o.total_amount||o.budget_total||o.valor_total||o.total||o.amount||0);if(direct)return direct;return budget(finMap.get(String(o.id)),partsTotalMap?.get(String(o.id)))}

  // Pluralização mínima pra "N geladeiras do mesmo modelo" -- só os
  // tipos de produto já vistos no restante do app; fallback genérico
  // com "(s)" pra não arriscar plural errado de um tipo desconhecido.
  const PLURAL={GELADEIRA:'geladeiras',REFRIGERADOR:'refrigeradores',TV:'TVs',FOGAO:'fogões',MICROONDAS:'micro-ondas','LAVA E SECA':'lava e secas',LAVADORA:'lavadoras'};
  function plural(t){const n=norm(t);return PLURAL[n]||(t?E(t).toLowerCase()+'(s)':'aparelho(s)')}

  function discovery(){
    const pool=[
      ['Gestão','Nem todo atraso é um problema isolado; repetição costuma indicar gargalo de processo.','Observe onde a fila cresce por vários dias. O ponto de acúmulo merece investigação antes de cobrar velocidade das pessoas.'],
      ['Prioridade','Urgência sem critério transforma tudo em urgente.','Defina prioridade pelo impacto no cliente, prazo e risco operacional. Isso reduz decisões por impulso.'],
      ['Qualidade','Um indicador útil deve levar a uma ação possível.','Se um número não permite identificar causa, responsável ou próximo passo, ele é apenas informação — não inteligência de gestão.'],
      ['Segurança','A melhor permissão é a menor necessária para realizar o trabalho.','Privilégio mínimo reduz impacto de erro humano, credencial comprometida e acesso indevido.'],
      ['Produtividade','Mais atividade não significa mais resultado.','Compare volume concluído, tempo de ciclo, retorno do cliente e retrabalho para distinguir esforço de produtividade real.']
    ];
    const d=pool[Math.floor(Date.now()/86400000)%pool.length];
    return `<div class="vx-c-discovery"><div><strong>💡 DESCOBERTA DO DIA · ${E(d[0])}</strong><p>${E(d[1])}</p></div><details><summary>Quero saber mais</summary><p>${E(d[2])}</p><small>Conteúdo local. Não consulta nem envia dados operacionais.</small></details></div>`;
  }

  window.renderDashboard=async function(){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card">Carregando inteligência operacional...</div>';

    const today=new Date();today.setHours(0,0,0,0);
    const month0=startOfMonth(today);
    const prevMonth0=new Date(month0.getFullYear(),month0.getMonth()-1,1);
    const agendaEnd=new Date(today);agendaEnd.setDate(agendaEnd.getDate()+4);
    const days30Ago=new Date(today);days30Ago.setDate(days30Ago.getDate()-30);
    const isoDate=d=>d.toISOString().slice(0,10);

    const results=await Promise.all([
      source('Ordens','service_orders?select=*,clients(name,neighborhood,city),equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(full_name)&order=opened_at.desc&limit=500',state?.orders||[]),
      source('Tarefas','tasks?select=*&order=due_at.asc.nullslast&limit=200',state?.tasks||[]),
      source('Casos de atenção','dashboard_cases?select=*&order=created_at.desc&limit=200',[]),
      source('Destinatários de casos','dashboard_case_recipients?select=case_id,user_id,role',[]),
      source('Agenda 5 dias',`appointments?select=*,service_orders(os_number,reported_defect,order_type,client_id,clients(neighborhood,city),equipments(product_type,brand,model))&appointment_date=gte.${isoDate(today)}&appointment_date=lte.${isoDate(agendaEnd)}&order=appointment_date.asc,period.asc,start_time.asc&limit=300`,[]),
      // Achado do usuário em 2026-09-03: o card "Agenda dos Técnicos"
      // só lia a tabela nativa `appointments` -- com o volume real de
      // atendimento vindo hoje quase todo de external_appointments
      // (Electrolux, sincronizado por sync-electrolux-agenda), o card
      // aparecia vazio mesmo com a Agenda de verdade cheia. Mesma
      // fonte/janela de datas já usada pela ponte real da Agenda
      // (electrolux-agenda-bridge-v0825.js).
      source('Agenda 5 dias Electrolux',`external_appointments?select=technician_id,appointment_date,period,external_order_number,client_name,notes,product_name,parts,address_neighborhood,address_city&appointment_date=gte.${isoDate(today)}&appointment_date=lte.${isoDate(agendaEnd)}&status=neq.CANCELADO&order=appointment_date.asc,period.asc&limit=300`,[]),
      source('Peças','parts_requests?select=*&order=created_at.desc&limit=200',[]),
      source('Financeiro','os_financial?select=*&limit=1000',[]),
      // Achado do usuário em 2026-09-03: "Orçamentos (Mês)" mostrava só
      // a mão de obra (ex.: R$550,00 numa OS de R$1.650,00 -- faltavam
      // as peças, R$1.100,00) -- budget() somava só os campos de
      // os_financial (mão de obra/frete/material/laudo/desconto),
      // NUNCA os_parts (peças do orçamento, mesma tabela que a tela da
      // OS usa pro total real -- ver os-detail-v0812.js budgetPanel()).
      // "Peças" (acima) é parts_requests, uma tabela DIFERENTE (pedido
      // de compra/estoque, sem valor unitário) -- nunca serviu pra
      // valor de orçamento, por isso ninguém tinha notado que faltava
      // buscar os_parts aqui.
      source('Peças do Orçamento','os_parts?select=service_order_id,quantity,unit_value',[]),
      source('Pagamentos','payments?select=*&order=paid_at.desc.nullslast&limit=1500',[]),
      source('Técnicos','profiles?select=id,full_name,role,store_id,external_schedule_enabled&active=eq.true&order=full_name',[]),
      source('Histórico de status',`os_status_history?select=*,service_orders(os_number,store_id,technician_id)&changed_at=gte.${isoDate(prevMonth0)}&order=changed_at.desc&limit=400`,[]),
      // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
      // "lojas autorizadas" é o mecanismo real já usado em
      // user-access-management-v0813.js (admin_update_user_access) --
      // reaproveitado aqui, nenhuma tabela nova.
      source('Lojas autorizadas',`user_store_access?user_id=eq.${me()}&active=eq.true&select=store_id`,[]),
      // Achado do usuário em 2026-09-03: a permissão "agenda.view_all"
      // ("Visualizar todas as agendas") já existia no catálogo e já
      // tinha sido concedida por um GESTOR pra um técnico específico
      // (via tela de permissões) -- mas nada nunca lia essa permissão,
      // então o Dashboard continuava restringindo esse técnico à
      // própria agenda mesmo com a permissão marcada. RLS de
      // appointments/external_appointments já foi ampliada (migration
      // 20260903040000) pra respeitar essa mesma permissão.
      source('Permissão agenda.view_all',`user_permissions?user_id=eq.${me()}&permission_key=eq.agenda.view_all&allowed=eq.true&select=id&limit=1`,[]),
    ]);
    const by=Object.fromEntries(results.map(r=>[r.label,r]));
    // Achado do usuário em 2026-09-04: Gestão Visual (e todo overdue*/
    // prazosCriticos que usa age()) contava OS com mais de 10 dias
    // aberta como "0 a 7 dias" -- a age() genérica (linha ~42) usa
    // updated_at||opened_at, e updated_at muda a QUALQUER edição da OS
    // (telefone do cliente, observação, peça...), não só quando o
    // status avança. Uma OS parada em AGUARDANDO ANÁLISE há 10 dias
    // mas editada hoje por outro motivo "resetava" a idade pra 0.
    // Redefine age() aqui (sombreia a de fora só dentro de discovery(),
    // onde toda leitura de age() já opera sobre listas filtradas por
    // status -- overdueAnalysis/overdueApproval/overdueRepair/
    // readyOverdue*/ageBuckets/prazosCriticos) usando a data real da
    // ÚLTIMA transição pra ESTE status em os_status_history (fonte já
    // buscada como "Histórico de status"); sem transição registrada
    // pra esse status (ex.: AGUARDANDO ANÁLISE é o status inicial, sem
    // linha de histórico própria), cai pra opened_at -- nunca
    // updated_at, que é exatamente o campo que causava o bug.
    const statusEnteredAtMap=new Map();
    safe(by['Histórico de status'].data).forEach(h=>{
      const key=`${h.service_order_id}|${norm(h.new_status)}`;
      const prev=statusEnteredAtMap.get(key);
      if(!prev||new Date(h.changed_at)>new Date(prev))statusEnteredAtMap.set(key,h.changed_at);
    });
    const age=o=>{
      const enteredAt=statusEnteredAtMap.get(`${o.id}|${norm(o.status)}`)||o.opened_at||o.updated_at||Date.now();
      return Math.max(0,Math.floor((Date.now()-new Date(enteredAt).getTime())/86400000));
    };
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // os indicadores gerais (linha de KPIs do topo) são da EMPRESA
    // SELECIONADA inteira pra qualquer perfil -- RLS já garante o
    // limite de empresa (current_company_id()), sem escopo adicional
    // por usuário aqui. O que muda por perfil é o resto dos cards
    // (Casos/Tarefas/Peças/Produtividade/etc.), tratado card a card
    // mais abaixo -- nunca este "active" usado no topo.
    const orders=safe(by['Ordens'].data), active=orders.filter(isOpen);
    const myStoreIds=new Set(safe(by['Lojas autorizadas'].data).map(r=>String(r.store_id)));
    const hasStoreRestriction=myStoreIds.size>0;
    const hasAgendaViewAll=safe(by['Permissão agenda.view_all'].data).length>0;
    const storeAuthorized=storeId=>!hasStoreRestriction||myStoreIds.has(String(storeId));
    const ordersById=new Map(orders.map(o=>[String(o.id),o]));
    // Reaproveitado por Casos/Tarefas/Peças/Produtividade/Feed -- decide
    // se UM registro (de qualquer tabela) é visível pro perfil atual,
    // dado o technician_id/store_id do próprio registro OU, quando
    // ausente, resolvido pela OS vinculada (service_order_id).
    function roleVisible(technicianId,storeId,linkedOrderId){
      if(!technicianId&&!storeId&&linkedOrderId){
        const linked=ordersById.get(String(linkedOrderId));
        technicianId=linked?.technician_id;storeId=linked?.store_id;
      }
      if(role()==='TECNICO')return String(technicianId)===String(me());
      return storeAuthorized(storeId);
    }
    const analysis=active.filter(o=>norm(o.status)==='AGUARDANDO ANALISE');
    const approval=active.filter(o=>norm(o.status)==='AGUARDANDO APROVACAO');
    // "repair" junta AGUARDANDO CONSERTO + EM CONSERTO de propósito --
    // usada tanto pela métrica já existente de "Oportunidade de
    // faturamento"/overdueRepair quanto pelo card "AGUARDANDO CONSERTO"
    // da Gestão Visual (achado do usuário em 2026-09-04: o critério
    // deve ser amplo, sem um "Em Conserto" à parte).
    const repair=active.filter(o=>['AGUARDANDO CONSERTO','EM CONSERTO'].includes(norm(o.status)));
    const ready=active.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
    const overdueAnalysis=analysis.filter(o=>age(o)>3), overdueApproval=approval.filter(o=>age(o)>3), overdueRepair=repair.filter(o=>age(o)>7);
    const readyOverdue7=ready.filter(o=>age(o)>7), readyOverdue3=ready.filter(o=>age(o)>3);
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // "active"/"analysis"/"approval"/"ready"/"repair" acima alimentam a
    // linha de KPIs do topo (empresa toda, sempre) -- Oportunidades do
    // Dia e Gestão por Exceção usam a MESMA lista de status, mas
    // escopada por perfil (lojas autorizadas/próprias). Subconjunto
    // derivado de "active", nunca uma consulta nova.
    const oppScope=roleVisible?active.filter(o=>roleVisible(o.technician_id,o.store_id,null)):active;
    const oppApproval=oppScope.filter(o=>norm(o.status)==='AGUARDANDO APROVACAO');
    const oppReady=oppScope.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
    const oppAnalysis=oppScope.filter(o=>norm(o.status)==='AGUARDANDO ANALISE');
    const oppRepair=oppScope.filter(o=>['AGUARDANDO CONSERTO','EM CONSERTO'].includes(norm(o.status)));
    const oppReadyOverdue3=oppReady.filter(o=>age(o)>3), oppOverdueRepair=oppRepair.filter(o=>age(o)>7);
    const noTech=active.filter(o=>!o.technician_id), urgent=active.filter(o=>norm(o.priority).includes('URG'));
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // "Minhas Tarefas" nunca filtrava por dono nenhum -- qualquer
    // perfil via as tarefas de todo mundo. Matriz pede "somente dele/
    // própria" pros 3 perfis, sem exceção nenhuma (nem GESTOR).
    const tasks=safe(by['Tarefas'].data).filter(t=>!['CONCLUIDO','CANCELADO'].includes(norm(t.status))&&String(t.assigned_to)===String(me()));
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // caso de atenção é "dele, compartilhado com ele ou encaminhado pra
    // ele" pra QUALQUER perfil agora, inclusive GESTOR -- antes GESTOR
    // via tudo sem restrição nenhuma. A matriz não abre exceção pra
    // caso "solto" (sem criador/atribuído/destinatário nenhum) -- regra
    // aplicada estrita e igual pros 3 perfis; TECNICO ganha só o
    // critério a mais de "relacionado à OS atribuída a ele".
    const caseRecipients=safe(by['Destinatários de casos'].data);
    const recipientsByCase=new Map();
    caseRecipients.forEach(r=>{if(!recipientsByCase.has(r.case_id))recipientsByCase.set(r.case_id,[]);recipientsByCase.get(r.case_id).push(r)});
    const myRole=role(),myId=me();
    function caseVisibleToMe(c){
      if(String(c.created_by)===String(myId))return true;
      if(String(c.assigned_to)===String(myId))return true;
      const recipients=recipientsByCase.get(c.id);
      if(recipients&&recipients.length){
        return recipients.some(r=>(r.user_id&&String(r.user_id)===String(myId))||(r.role&&r.role===myRole));
      }
      const linked=c.service_order_id?ordersById.get(String(c.service_order_id)):null;
      return !!linked&&String(linked.technician_id)===String(myId);
    }
    const casesAll=safe(by['Casos de atenção'].data).filter(caseVisibleToMe);
    const casesAbertos=casesAll.filter(c=>!['RESOLVIDO','CANCELADO'].includes(norm(c.status)));
    // Achado do usuário em 2026-09-04: os 3 números (Novos/Em andamento/
    // Resolvidos) devem contar só casos RECEBIDOS -- casesAll inclui os
    // que EU criei também (é o que caseVisibleToMe também permite, de
    // propósito, pra "Meus Casos Enviados" funcionar). Um caso que eu
    // mesmo abri não deveria contar como "recebido para triagem".
    const casesReceived=casesAll.filter(c=>String(c.created_by)!==String(myId));
    // Card "Casos de Atenção": Novos/Em andamento/Resolvidos, escopados
    // aos últimos 30 dias -- confirmado pelo usuário em 2026-09-01 (a
    // versão anterior, mais conservadora, tratava EM ANDAMENTO/
    // RESOLVIDO como vocabulário não confirmado; o usuário confirmou
    // que é exatamente esse o vocabulário real esperado).
    const casesLast30=casesReceived.filter(c=>c.created_at&&new Date(c.created_at)>=days30Ago);
    const casesNovos=casesLast30.filter(c=>norm(c.status)==='NOVO');
    const casesAndamento=casesLast30.filter(c=>norm(c.status)==='EM ANDAMENTO');
    const casesResolvidos=casesLast30.filter(c=>norm(c.status)==='RESOLVIDO');
    // Achado do usuário em 2026-09-04: quem abre um caso não tinha
    // como acompanhar os próprios casos enviados, nem checar se já
    // tinha aberto um igual antes de criar outro -- "meus casos" é só
    // um filtro de casesAll (já escopado por caseVisibleToMe, que já
    // inclui created_by===myId) por quem criou, sem fetch novo.
    // myCases fica com a lista completa (pro "Ver todos"); o card
    // inline mostra até 10 dentro de uma área com rolagem própria (não
    // cresce mais o Dashboard a cada caso novo -- achado do usuário).
    const myCases=casesAll.filter(c=>String(c.created_by)===String(myId)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const myCasesInline=myCases.slice(0,10);
    // Card "Pedidos de Peças": Pendentes de aprovação/Em compra/
    // Aguardando entrega/Atrasados/Recebidos hoje -- vocabulário
    // confirmado pelo usuário em 2026-09-01 (mesma situação de Casos
    // de Atenção: sem CHECK constraint no schema, mas confirmado como
    // o vocabulário real esperado, não suposição a partir da imagem).
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // Pedidos de Peças era visível por igual pra todo mundo -- matriz
    // pede "lojas autorizadas" (ATENDENTE/GESTOR) ou "próprios/
    // relacionados à OS atribuída" (TECNICO). requested_by/assigned_to
    // direto no pedido conta como "próprio" antes de cair pro
    // técnico/loja da OS vinculada.
    function partVisible(p){
      if(String(p.requested_by)===String(me())||String(p.assigned_to)===String(me()))return true;
      return roleVisible(null,null,p.service_order_id);
    }
    const partsAll=safe(by['Peças'].data).filter(partVisible);
    const partsPendentes=partsAll.filter(p=>['PENDENTE','SOLICITADO'].includes(norm(p.status)));
    const partsCompra=partsAll.filter(p=>norm(p.status).includes('COMPRA'));
    const partsEntrega=partsAll.filter(p=>norm(p.status).includes('ENTREGA'));
    const partsAtrasadas=partsAll.filter(p=>p.expected_date&&new Date(p.expected_date)<today&&!norm(p.status).includes('RECEBID'));
    const partsRecebidasHoje=partsAll.filter(p=>norm(p.status).includes('RECEBID')&&p.updated_at&&isoDate(new Date(p.updated_at))===isoDate(today));
    const finMap=new Map(safe(by['Financeiro'].data).map(f=>[String(f.service_order_id),f]));
    const partsTotalMap=new Map();
    safe(by['Peças do Orçamento'].data).forEach(p=>{
      const key=String(p.service_order_id);
      partsTotalMap.set(key,(partsTotalMap.get(key)||0)+Number(p.quantity||0)*Number(p.unit_value||0));
    });
    const validPayments=safe(by['Pagamentos'].data).filter(p=>p.paid_at&&!['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'].includes(norm(p.status)));
    const receivedMonth=validPayments.filter(p=>new Date(p.paid_at)>=month0).reduce((s,p)=>s+Number(p.amount||0),0);

    // Resumo Financeiro -- 6 métricas. Definição original dada pelo
    // usuário em 2026-09-01 (a imagem de referência é só o layout; as
    // definições de cada card vieram por texto, não da imagem);
    // "A receber" x "Oportunidade de faturamento" CORRIGIDO em
    // 2026-09-02 -- achado do usuário: as duas métricas contavam a
    // mesma OS em conserto duas vezes (uma líquida, outra bruta).
    // Definição confirmada pelo usuário (versão do Dashboard -- o
    // relatório financeiro completo, tela separada, pode ter conceito
    // diferente):
    // 1. Faturamento realizado = quanto efetivamente entrou no mês
    //    (= receivedMonth, já real).
    // 2. A receber = orçado em OS PRONTAS PARA ENTREGA (aparelho já
    //    concluído, só aguardando o cliente retirar), menos o que já
    //    foi pago dessa OS. Não inclui mais OS ainda em conserto --
    //    essas agora só entram em "Oportunidade de faturamento" (ver
    //    item 5), pra não contar o mesmo valor duas vezes.
    // 3. Média diária = faturamento realizado dividido pelos dias já
    //    passados do mês corrente.
    // 4. Ticket médio recebido = faturamento realizado dividido pelo
    //    número de OS distintas que receberam pagamento no mês.
    // 5. Oportunidade de faturamento = OS já aprovadas/autorizado o
    //    reparo, ainda em conserto (AGUARDANDO CONSERTO/EM CONSERTO) --
    //    "quase certo o recebimento, só falta a ação da equipe pra
    //    gerar o resultado" (palavras do usuário) -- é o "repair" já
    //    calculado acima, valor bruto orçado (não líquido -- é
    //    potencial, não dívida em aberto).
    // 6. Meta do mês = sem tabela real de meta financeira persistida
    //    (mesma situação do card "Metas e Bonificação" ao lado) --
    //    fica honestamente "Não configurado", nunca um número inventado.
    const paidByOrder=new Map();
    validPayments.forEach(p=>{const k=String(p.service_order_id);paidByOrder.set(k,(paidByOrder.get(k)||0)+Number(p.amount||0))});
    const aReceber=orders.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA').reduce((s,o)=>{
      const bud=budget(finMap.get(String(o.id)),partsTotalMap.get(String(o.id))), paid=paidByOrder.get(String(o.id))||0;
      return s+Math.max(0,bud-paid);
    },0);
    const mediaDiaria=receivedMonth/Math.max(1,today.getDate());
    const paidThisMonthOrderIds=new Set(validPayments.filter(p=>new Date(p.paid_at)>=month0).map(p=>String(p.service_order_id)));
    const ticketMedioRecebido=paidThisMonthOrderIds.size?receivedMonth/paidThisMonthOrderIds.size:0;
    const oportunidadeFaturamento=repair.reduce((s,o)=>s+budget(finMap.get(String(o.id)),partsTotalMap.get(String(o.id))),0);
    const failures=results.filter(r=>!r.ok).map(r=>r.label);
    // Achado do usuário 2026-09-03: filtro estrito role==='TECNICO'
    // escondia quem acumula outro papel (ex.: GESTOR) mas também atende
    // campo de verdade -- some da Agenda E da Produtividade assim que
    // o papel muda, mesmo com OS/atendimentos reais atribuídos a ele.
    // Mesmo critério já usado em field-agenda-complete-v0813.js e
    // electrolux-agenda-bridge-v0825.js (external_schedule_enabled),
    // nunca um critério novo.
    const techs=safe(by['Técnicos'].data).filter(t=>norm(t.role)==='TECNICO'||t.external_schedule_enabled);
    const history=safe(by['Histórico de status'].data);

    // clientes com mais de 1 OS ativa -- usa oppScope (Oportunidades/
    // Gestão por Exceção, escopado por perfil), não o "active" do topo.
    const byClient=new Map();
    oppScope.forEach(o=>{if(!o.client_id)return;byClient.set(o.client_id,(byClient.get(o.client_id)||0)+1)});
    const repeatClients=[...byClient.values()].filter(n=>n>1).length;
    const repeatClientOrders=oppScope.filter(o=>o.client_id&&byClient.get(o.client_id)>1);

    // retiradas previstas pra hoje = compromisso de hoje numa OS já pronta
    // (só faz sentido pra agenda NATIVA -- Electrolux não tem OS/pronto
    // pra entrega neste sistema, é outro ciclo de status, ver
    // sync-electrolux-nps).
    const agenda=safe(by['Agenda 5 dias'].data);
    const todayApptOrderIds=new Set(agenda.filter(a=>a.appointment_date===isoDate(today)).map(a=>a.service_order_id));
    const retiradasHojeOrders=oppReady.filter(o=>todayApptOrderIds.has(o.id));
    const retiradasHoje=retiradasHojeOrders.length;
    // Achado do usuário em 2026-09-03: as 5 linhas do card "Oportunidades
    // do Dia" eram <div> sem data-drill nenhum -- clicar não fazia
    // nada (mesma classe de bug do card Casos de Atenção). Rows reais
    // pra "Prazos críticos" (mesma combinação de filtros já usada só
    // pra contar).
    const prazosCriticosOrders=[...oppAnalysis.filter(o=>age(o)===2),...oppApproval.filter(o=>age(o)===2),...oppRepair.filter(o=>age(o)===6)];

    // Card "Agenda dos Técnicos" (widget, achado 2026-09-03): une a
    // agenda nativa com a Electrolux, normalizadas no mesmo formato --
    // nunca mistura no `agenda` acima (que alimenta retiradasHoje, uma
    // conta que só vale pra OS nativa).
    const agendaWidgetRows=[
      ...agenda.map(a=>{
        const eq=a.service_orders?.equipments||{};
        const modelKey=[eq.product_type,eq.brand,eq.model].filter(Boolean).join('|')||null;
        return {
          technician_id:a.technician_id,appointment_date:a.appointment_date,period:a.period,
          equipmentLabel:[eq.product_type,eq.brand,eq.model].filter(Boolean).join(' · ')||'Equipamento',
          modelKey,productType:eq.product_type||null,
          location:a.service_orders?.clients?.neighborhood||a.service_orders?.clients?.city||'',
          defect:a.service_orders?.reported_defect||'',
          // Achado do usuário em 2026-09-03: tipo de atendimento
          // (Garantia/Fora de Garantia/Seguradora/etc.) -- só existe
          // pra OS nativa (service_orders.order_type); a agenda
          // Electrolux não tem esse conceito na sincronização, nunca
          // inventado aqui.
          orderType:a.service_orders?.order_type||null,
          source:'NATIVO',
        };
      }),
      ...safe(by['Agenda 5 dias Electrolux'].data).map(a=>{
        const osLabel=a.external_order_number?`OS ${a.external_order_number}`:'Electrolux';
        // Achado do usuário 2026-09-03: Bairro/Modelo/Peça reais, nunca
        // inventados -- Modelo vem de graça na sincronização (produt_name,
        // já populado a cada 10min); Bairro/Peça só existem quando o
        // enriquecimento por detalhe (sync-electrolux-agenda) já
        // conseguiu captar essa SVO específica -- até lá ficam de fora,
        // sem inventar nem aproximar.
        const partsList=Array.isArray(a.parts)?a.parts:[];
        const partsLabel=partsList.length?partsList.map(p=>p.descricao).filter(Boolean).join(', '):null;
        return{
          technician_id:a.technician_id,appointment_date:a.appointment_date,period:a.period,
          equipmentLabel:a.product_name?`${osLabel} · ${a.product_name}`:osLabel,
          modelKey:a.product_name||null,productType:a.product_name||null,
          location:a.address_neighborhood||a.address_city||'',
          defect:a.notes||'',partsLabel,source:'ELECTROLUX',
        };
      }),
    ];

    // Orçamentos/Entregues do mês, via os_status_history (data real da
    // transição, não opened_at/updated_at da OS).
    function monthTransitions(statusLabel,from,to){
      const ids=new Set(history.filter(h=>norm(h.new_status)===statusLabel&&new Date(h.changed_at)>=from&&new Date(h.changed_at)<to).map(h=>h.service_order_id));
      const rows=orders.filter(o=>ids.has(o.id));
      return {count:ids.size,value:rows.reduce((s,o)=>s+budget(finMap.get(String(o.id)),partsTotalMap.get(String(o.id))),0),rows};
    }
    const monthEnd=new Date(month0.getFullYear(),month0.getMonth()+1,1);
    const orcamentosMes=monthTransitions('AGUARDANDO APROVACAO',month0,monthEnd);
    const entreguesMes=monthTransitions('FINALIZADA',month0,monthEnd);
    const activeOpenedThisMonth=active.filter(o=>new Date(o.opened_at)>=month0).length;

    // Gestão Visual -- faixas de idade (0-7/8-15/16-30/31-90 dias),
    // corrigido em 2026-09-01 a pedido do usuário (faixas antigas
    // 0/1-3/4-7/8+ estavam erradas -- inclusive sobrepostas).
    function ageBuckets(rows){
      const b=[0,0,0,0], rowsByBucket=[[],[],[],[]];
      rows.forEach(o=>{const a=age(o);const i=a<=7?0:a<=15?1:a<=30?2:3;b[i]++;rowsByBucket[i].push(o)});
      const oldest=rows.reduce((m,o)=>Math.max(m,age(o)),0);
      return {b,oldest,rowsByBucket};
    }
    const gvAnalysis=ageBuckets(analysis), gvApproval=ageBuckets(approval), gvConserto=ageBuckets(repair), gvReady=ageBuckets(ready);
    // Drill-down por faixa etária do Gestão Visual -- clicar num
    // número/segmento mostra exatamente quais OS estão naquela faixa
    // (achado do usuário em 2026-09-01: os números eram estáticos, sem
    // forma de ver quais atendimentos estavam por trás do total).
    const gvDrills={};
    [['gvAnalysis',gvAnalysis,'Aguardando Análise'],['gvApproval',gvApproval,'Aguardando Aprovação'],['gvConserto',gvConserto,'Aguardando Conserto'],['gvReady',gvReady,'Prontos para Entrega']].forEach(([key,g,label])=>{
      g.rowsByBucket.forEach((rows,i)=>{gvDrills[`${key}_b${i}`]=rows});
    });

    // Produtividade por técnico (tabela) -- OS/Valor recebido/Prontos/Aproveitamento.
    // Achado do usuário em 2026-09-02: ao contrário dos outros cards
    // (corrigidos no commit 5d32a85), esta tabela nunca ganhou
    // drill-down -- "2 OS" era só texto estático, sem como ver quais
    // eram. Corrigido do mesmo jeito: cada célula clicável abre o
    // modal real com as OS por trás do número.
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // Produtividade era visível igual pra todo mundo -- TECNICO deve
    // ver só a própria linha; ATENDENTE/GESTOR só técnicos das lojas
    // autorizadas (profiles.store_id, mesmo campo usado em
    // admin_update_user_access).
    const prodTechs=role()==='TECNICO'?techs.filter(t=>String(t.id)===String(me())):techs.filter(t=>storeAuthorized(t.store_id));
    const prodRows=prodTechs.map(t=>{
      const mine=orders.filter(o=>o.technician_id===t.id);
      const readyRowsMine=mine.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
      const finalMine=mine.filter(o=>norm(o.status)==='FINALIZADA');
      const valorRecebido=validPayments.filter(p=>mine.some(o=>String(o.id)===String(p.service_order_id))).reduce((s,p)=>s+Number(p.amount||0),0);
      return {tech:t,os:mine.length,osRows:mine,valor:valorRecebido,prontos:readyRowsMine.length,prontosRows:readyRowsMine,aproveitamento:pct(finalMine.length,mine.length||1)};
    }).filter(r=>r.os>0).sort((a,b)=>b.valor-a.valor);
    const totalRecebidoOS=prodRows.reduce((s,r)=>s+r.valor,0);
    const prodDrills={};
    prodRows.forEach(r=>{prodDrills['prodOs_'+r.tech.id]=r.osRows;prodDrills['prodProntos_'+r.tech.id]=r.prontosRows});

    // Feed em tempo real -- eventos reais de os_status_history.
    function feedText(h){
      const num=h.service_orders?.os_number||'—';
      const ns=norm(h.new_status);
      if(!h.previous_status)return `Nova OS #${num} criada`;
      if(ns==='AGUARDANDO APROVACAO')return `Orçamento gerado — OS #${num}`;
      if(norm(h.previous_status)==='AGUARDANDO APROVACAO'&&ns==='AGUARDANDO CONSERTO')return `Orçamento aprovado — OS #${num}`;
      if(ns==='EM CONSERTO'||ns==='AGUARDANDO CONSERTO')return `OS #${num} entrou em conserto`;
      if(ns==='PRONTO PARA ENTREGA')return `OS #${num} pronta para entrega`;
      if(ns==='FINALIZADA')return `OS #${num} marcada como concluída`;
      return `OS #${num}: ${E(norm(h.previous_status))} → ${E(ns)}`;
    }
    // Achado do usuário em 2026-09-02 (matriz oficial de visibilidade):
    // Feed em Tempo Real era visível igual pra todo mundo -- escopado
    // pelo técnico/loja da OS vinculada (join já traz technician_id/
    // store_id em service_orders).
    const historyScoped=history.filter(h=>roleVisible(h.service_orders?.technician_id,h.service_orders?.store_id,null));
    const feed=historyScoped.slice(0,8);

    // Agenda -- próximos 5 dias, agrupado por dia/período, com
    // detecção de aparelhos repetidos (mesmo modelo, ou mesma região).
    // Achado do usuário em 2026-09-02: o card se chamava "Minha
    // Agenda" mas a consulta nunca filtrava por técnico nenhum --
    // mostrava os compromissos de TODOS os técnicos misturados, pra
    // qualquer perfil. Corrigido: TÉCNICO só vê a própria agenda de
    // verdade agora; GESTOR/ATENDENTE viram "Agenda dos Técnicos", com
    // navegação pra escolher um técnico (ou "Todos", mesmo
    // comportamento de antes -- tudo misturado) sem precisar recarregar
    // o Dashboard inteiro (buildAgendaDays/agendaCardHtml ficam
    // acessíveis fora deste closure via window.__vxDashAgenda pra
    // renderAgendaCardOnly() re-renderizar só o card).
    const weekdayShort=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    function buildAgendaDays(techFilterId){
      const filtered=techFilterId?agendaWidgetRows.filter(a=>String(a.technician_id)===String(techFilterId)):agendaWidgetRows;
      return [0,1,2,3,4].map(off=>{
        const d=new Date(today);d.setDate(d.getDate()+off);
        const iso=isoDate(d);
        const rows=filtered.filter(a=>a.appointment_date===iso);
        const label=off===0?'Hoje':off===1?'Amanhã':`${weekdayShort[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}`;
        const byModel=new Map(),byRegion=new Map();
        rows.forEach(a=>{
          if(a.modelKey)byModel.set(a.modelKey,(byModel.get(a.modelKey)||[]).concat(a));
          if(a.location&&a.productType){const k=a.productType+'|'+a.location;byRegion.set(k,(byRegion.get(k)||[]).concat(a))}
        });
        let dupWarning='';
        const modelDup=[...byModel.entries()].find(([,v])=>v.length>1);
        if(modelDup){dupWarning=`${modelDup[1].length} ${plural(modelDup[1][0].productType)} do mesmo modelo`}
        else{const regionDup=[...byRegion.entries()].find(([,v])=>v.length>1);if(regionDup){const [type]=regionDup[0].split('|');dupWarning=`${regionDup[1].length} ${plural(type)} na mesma região`}}
        return {label,iso,rows,count:rows.length,dupWarning};
      });
    }
    // GESTOR/ATENDENTE começam em "Todos os técnicos" (sem filtro,
    // mesmo comportamento de sempre); TÉCNICO é sempre e só a própria
    // agenda, sem seletor -- nunca outro usuário. Navegação entre
    // técnicos usa a mesma lista "techs" já usada na Produtividade
    // (RLS já escopa por empresa -- ver profiles_select_company;
    // não existe hoje nenhuma restrição adicional por loja pra
    // ATENDENTE em lugar nenhum deste arquivo, então não inventei uma
    // aqui -- reportado no fechamento).
    let agendaSelectedTechId=(role()==='TECNICO'&&!hasAgendaViewAll)?me():null;
    function apptCard(a){
      const srcTag=a.source==='ELECTROLUX'?'<small class="vx-c-appt-src">Electrolux</small>':'';
      // Achado do usuário em 2026-09-03: tipo de atendimento (Garantia/
      // Fora de Garantia/Seguradora/etc., service_orders.order_type) --
      // só existe pra OS nativa, nunca inventado pra Electrolux.
      const typeTag=a.orderType?`<small class="vx-c-appt-type">${E(a.orderType)}</small>`:'';
      const partsHtml=a.partsLabel?`<span class="vx-c-appt-parts">🔧 ${E(a.partsLabel)}</span>`:'';
      return `<div class="vx-c-appt"><b>${E(a.equipmentLabel)}</b>${srcTag}${typeTag}<span>${E(a.location)}${a.location&&a.defect?' · ':''}${E(a.defect)}</span>${partsHtml}</div>`;
    }
    // Achado do usuário 2026-09-03: promover alguém de TECNICO pra
    // GESTOR (ex.: acumula os dois papéis de verdade) fazia "Minha
    // Agenda" virar "Agenda dos Técnicos" sem nenhum atalho pra achar
    // de novo só os próprios atendimentos -- em vez de criar um perfil
    // novo (mexeria em RLS de OS/financeiro/tarefas/peças em cascata),
    // reaproveita o MESMO seletor de técnico que já existe aqui.
    function meAsFieldTech(){return techs.find(t=>String(t.id)===String(me())&&(norm(t.role)==='TECNICO'||t.external_schedule_enabled))}
    function agendaSectionHtml(techFilterId){
      const isTecnico=role()==='TECNICO'&&!hasAgendaViewAll;
      const currentDays=buildAgendaDays(techFilterId);
      const idx=techFilterId?techs.findIndex(t=>String(t.id)===String(techFilterId)):-1;
      const title=isTecnico?'Minha Agenda':'Agenda dos Técnicos';
      const meTech=!isTecnico?meAsFieldTech():null;
      const grid=`<div class="vx-c-agenda5-grid">${currentDays.map(d=>{
        const manha=d.rows.filter(a=>norm(a.period)!=='TARDE'), tarde=d.rows.filter(a=>norm(a.period)==='TARDE');
        return `<div class="vx-c-agenda5-day"><div class="vx-c-agenda5-day-head"><strong>${E(d.label)}</strong><span>${d.count}</span></div>
          ${manha.length?`<div class="vx-c-agenda5-period"><small>MANHÃ</small>${manha.map(apptCard).join('')}</div>`:''}
          ${tarde.length?`<div class="vx-c-agenda5-period"><small>TARDE</small>${tarde.map(apptCard).join('')}</div>`:''}
          ${!d.count?'<p class="vx-c-empty">Sem compromissos.</p>':''}
          ${d.dupWarning?`<div class="vx-c-agenda5-warn">⚠ ${E(d.dupWarning)}</div>`:''}
        </div>`;
      }).join('')}</div>`;
      const techNav=isTecnico?'':`<div class="vx-c-agenda5-tech-nav">
        <button type="button" id="vxAgendaTechPrev" ${idx<=0?'disabled':''} title="Técnico anterior">‹</button>
        <select id="vxAgendaTechSelect">
          <option value="" ${!techFilterId?'selected':''}>Todos os técnicos</option>
          ${techs.map(t=>`<option value="${E(t.id)}" ${String(t.id)===String(techFilterId)?'selected':''}>${E(t.full_name)}</option>`).join('')}
        </select>
        <button type="button" id="vxAgendaTechNext" ${idx>=0&&idx>=techs.length-1?'disabled':''} title="Próximo técnico">›</button>
      </div>`;
      const meTechBtn=meTech&&String(techFilterId)!==String(meTech.id)?`<button type="button" id="vxAgendaMeuBtn" class="vx-c-agenda5-me-btn">Meus atendimentos</button>`:'';
      return `<section class="vx-c-agenda5-card" id="vxAgendaCard">
        <div class="vx-c-title"><h3>◷ ${title} — Próximos 5 dias</h3><span style="display:flex;gap:10px;align-items:center">${meTechBtn}<a href="#" id="vxAgendaFull">Ver agenda completa</a></span></div>
        ${techNav}
        ${grid}
      </section>`;
    }
    function wireAgendaCard(){
      document.getElementById('vxAgendaFull').onclick=(ev)=>{
        ev.preventDefault();
        window.__vxAgendaTechFilter=agendaSelectedTechId||null;
        if(typeof window.render==='function')window.render('agenda');
      };
      document.getElementById('vxAgendaMeuBtn')?.addEventListener('click',()=>{
        const mine=meAsFieldTech();
        if(mine){agendaSelectedTechId=mine.id;renderAgendaCardOnly()}
      });
      document.getElementById('vxAgendaTechSelect')?.addEventListener('change',e=>{agendaSelectedTechId=e.target.value||null;renderAgendaCardOnly()});
      document.getElementById('vxAgendaTechPrev')?.addEventListener('click',()=>{
        const idx=techs.findIndex(t=>String(t.id)===String(agendaSelectedTechId));
        if(idx>0){agendaSelectedTechId=techs[idx-1].id;renderAgendaCardOnly()}
      });
      document.getElementById('vxAgendaTechNext')?.addEventListener('click',()=>{
        const idx=techs.findIndex(t=>String(t.id)===String(agendaSelectedTechId));
        if(idx===-1){if(techs.length){agendaSelectedTechId=techs[0].id;renderAgendaCardOnly()}return}
        if(idx<techs.length-1){agendaSelectedTechId=techs[idx+1].id;renderAgendaCardOnly()}
      });
    }
    // "Trocar técnico atualiza somente o conteúdo do card" -- pedido
    // do usuário em 2026-09-02: nunca recarrega o Dashboard inteiro,
    // só troca o <section> da agenda.
    function renderAgendaCardOnly(){
      const card=document.getElementById('vxAgendaCard');
      if(!card)return;
      card.outerHTML=agendaSectionHtml(agendaSelectedTechId);
      wireAgendaCard();
    }

    const drills={active,analysis,approval,repair,ready,noTech,urgent,overdueAnalysis,overdueApproval,overdueRepair,readyOverdue7,readyOverdue3,orcamentosMes:orcamentosMes.rows,entreguesMes:entreguesMes.rows,repeatClientOrders,oppApproval,oppReady,oppOverdueRepair,oppOverdueApproval:oppApproval.filter(o=>age(o)>3),oppReadyOverdue3,retiradasHojeOrders,prazosCriticosOrders,...gvDrills,...prodDrills};
    const partsDrills={partsAll,partsPendentes,partsCompra,partsEntrega,partsAtrasadas,partsRecebidasHoje};
    const tasksDrills={tasks};
    const caseDrills={casesAbertos,casesNovos,casesAndamento,casesResolvidos,myCases};

    function kpi(icon,title,value,sub,key){return `<button type="button" class="vx-c-kpi" data-drill="${key}" data-title="${E(title)}"><span class="vx-c-kpi-icon">${icon}</span><span class="vx-c-kpi-label">${E(title)}</span><b>${E(value)}</b><small>${E(sub)}</small></button>`}
    function oppRow(label,n,key){
      if(!key)return `<div class="vx-c-opp-row"><span>${E(label)}</span><b>${n}</b></div>`;
      return `<button type="button" class="vx-c-opp-row" data-drill="${key}" data-title="${E(label)}"><span>${E(label)}</span><b>${n}</b></button>`;
    }
    function taskRow(label,n,key){
      if(!key)return `<div class="vx-c-task-row"><span class="vx-c-task-check">☐</span><span>${E(label)}</span><b>${n}</b></div>`;
      return `<button type="button" class="vx-c-task-row" data-drill="${key}" data-title="${E(label)}"${n?'':' disabled'}><span class="vx-c-task-check">☐</span><span>${E(label)}</span><b>${n}</b></button>`;
    }
    function iconRow(icon,label,n,tone,key){
      if(!key)return `<div class="vx-c-icon-row"><span class="vx-c-icon-row-ic ${tone||''}">${icon}</span><span>${E(label)}</span><b>${n}</b></div>`;
      return `<button type="button" class="vx-c-icon-row" data-drill="${key}" data-title="${E(label)}"${n?'':' disabled'}><span class="vx-c-icon-row-ic ${tone||''}">${icon}</span><span>${E(label)}</span><b>${n}</b></button>`;
    }
    function gvPanel(title,g,drillKey){
      const labels=['0 a 7 dias','8 a 15 dias','16 a 30 dias','31 a 90 dias'],tones=['b0','b1','b2','b3'];
      return `<div class="vx-c-gv-panel"><div class="vx-c-gv-head"><strong>${E(title)}</strong><span>Total: ${g.b.reduce((s,n)=>s+n,0)}</span></div>
        <div class="vx-c-gv-bar">${g.b.map((n,i)=>`<span class="vx-c-gv-seg ${tones[i]}" style="flex:${Math.max(n,0.001)}"></span>`).join('')}</div>
        <div class="vx-c-gv-legend">${g.b.map((n,i)=>`<button type="button" class="vx-c-gv-legend-item" data-drill="${drillKey}_b${i}" data-title="${E(title)} — ${labels[i]}" ${n?'':'disabled'}><small>${labels[i]}</small><b>${n}</b></button>`).join('')}</div>
        <small class="vx-c-gv-oldest">Mais antigo: ${g.oldest} dia${g.oldest===1?'':'s'}</small></div>`;
    }

    app.innerHTML=`<div class="vx-canonical">
      ${failures.length?`<div class="vx-c-warning"><strong>Dados parciais:</strong> ${E(failures.join(', '))} não responderam. O Dashboard continuou com as demais fontes.</div>`:''}
      <div class="vx-c-hero"><div><span class="vx-c-hero-eyebrow">VOXASSIST · PAINEL DE GESTÃO</span><h2>${role()==='GESTOR'?'Visão Geral da Operação':role()==='TECNICO'?'Minha Central Técnica':'Minha Central de Atendimento'}</h2><p>Dados atualizados em tempo real.</p></div><span class="vx-c-hero-date">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span></div>

      <div class="vx-c-kpirow">
        ${kpi('📋','OS Ativas',active.length,`+${activeOpenedThisMonth} este mês`,'active')}
        ${kpi('📥','Aguardando Análise',analysis.length,`${overdueAnalysis.length} acima do prazo`,'analysis')}
        ${kpi('⏳','Aguardando Aprovação',approval.length,`${urgent.filter(o=>approval.includes(o)).length} urgentes`,'approval')}
        ${kpi('🔧','Em Conserto',repair.length,overdueRepair.length?`${overdueRepair.length} acima do prazo`:'Normal','repair')}
        ${kpi('📦','Prontos para Entrega',ready.length,`${readyOverdue7.length} há mais de 7 dias`,'ready')}
        ${kpi('💰','Orçamentos (Mês)',orcamentosMes.count,M(orcamentosMes.value),'orcamentosMes')}
        ${kpi('🚚','Entregues (Mês)',entreguesMes.count,M(entreguesMes.value),'entreguesMes')}
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-cases-card"><div class="vx-c-title"><h3>⚠ Casos de Atenção</h3><a href="#" data-drill="casesAbertos" data-title="Casos de Atenção">Ver todos os casos ›</a></div>
          <div class="vx-c-cases-row">
            <button type="button" class="vx-c-case-item" data-drill="cases:casesNovos" data-title="Novos casos"><span class="vx-c-case-ic">📄</span><div class="vx-c-case-txt"><b>${casesNovos.length}</b><span>Novos casos</span><small>Requerem triagem</small></div><span class="vx-c-case-chev">›</span></button>
            <button type="button" class="vx-c-case-item" data-drill="cases:casesAndamento" data-title="Em andamento"><span class="vx-c-case-ic">🕐</span><div class="vx-c-case-txt"><b>${casesAndamento.length}</b><span>Em andamento</span><small>Aguardando retorno do cliente</small></div><span class="vx-c-case-chev">›</span></button>
            <button type="button" class="vx-c-case-item" data-drill="cases:casesResolvidos" data-title="Resolvidos"><span class="vx-c-case-ic">✓</span><div class="vx-c-case-txt"><b>${casesResolvidos.length}</b><span>Resolvidos</span><small>Últimos 30 dias</small></div><span class="vx-c-case-chev">›</span></button>
          </div>
          <div class="vx-c-mycases-inline">
            <div class="vx-c-mycases-inline-head"><span>MEUS CASOS ENVIADOS</span>${myCases.length>myCasesInline.length?`<a href="#" data-drill="cases:myCases" data-title="Meus Casos Enviados">Ver todos</a>`:''}</div>
            <div class="vx-c-mycases-scroll">${myCasesInline.length?myCasesInline.map(myCaseRow).join(''):'<p class="vx-c-mycases-empty">Você ainda não abriu nenhum caso -- confira aqui antes de abrir um novo, pra não duplicar.</p>'}</div>
          </div>
        </section>
        <section class="vx-c-opp-card"><div class="vx-c-title"><h3>◎ Oportunidades do Dia</h3><a href="#" data-drill="ready" data-title="Oportunidades do Dia">Ver todas</a></div>
          ${oppRow('Retiradas previstas para hoje',retiradasHoje,'retiradasHojeOrders')}
          ${oppRow('Orçamentos sem resposta',oppApproval.length,'oppApproval')}
          ${oppRow('Aparelhos prontos para retirada',oppReady.length,'oppReady')}
          ${oppRow('Prazos críticos próximos',prazosCriticosOrders.length,'prazosCriticosOrders')}
          ${oppRow('Clientes com mais de 1 OS',repeatClients,'repeatClientOrders')}
        </section>
      </div>

      ${role()==='GESTOR'?`<section class="vx-c-gv-card"><div class="vx-c-title"><h3>▥ Gestão Visual <span class="vx-c-info" title="Distribuição das OS por tempo desde a última mudança de situação">ⓘ</span></h3><a href="#" data-drill="active" data-title="Gestão Visual">Ver todos</a></div>
        <div class="vx-c-gv-grid">${gvPanel('AGUARDANDO ANÁLISE',gvAnalysis,'gvAnalysis')}${gvPanel('AGUARDANDO APROVAÇÃO',gvApproval,'gvApproval')}${gvPanel('AGUARDANDO CONSERTO',gvConserto,'gvConserto')}${gvPanel('PRONTOS PARA ENTREGA',gvReady,'gvReady')}</div>
      </section>`:''}

      <div class="vx-c-grid-3">
        <section class="vx-c-list-card vx-c-list-tasks"><div class="vx-c-title"><h3>☑ Minhas Tarefas</h3></div>
          ${taskRow('Tirar novos casos de atenção',casesNovos.length,'cases:casesNovos')}
          ${taskRow('Retornar clientes pendentes',tasks.length,'tasks:tasks')}
          ${taskRow('Acompanhar orçamentos sem resposta',oppApproval.length,'oppApproval')}
          ${taskRow('Aprovar pedidos de peças',partsPendentes.length,'parts:partsPendentes')}
          ${taskRow('Confirmar aparelhos prontos',oppReady.length,'oppReady')}
        </section>
        <section class="vx-c-list-card vx-c-list-parts"><div class="vx-c-title"><h3>▦ Pedidos de Peças</h3><a href="#" data-drill="parts:partsAll" data-title="Pedidos de Peças">Ver todas</a></div>
          ${iconRow('◷','Pendentes de aprovação',partsPendentes.length,'','parts:partsPendentes')}
          ${iconRow('🛒','Em compra',partsCompra.length,'','parts:partsCompra')}
          ${iconRow('🚚','Aguardando entrega',partsEntrega.length,'','parts:partsEntrega')}
          ${iconRow('⚠','Atrasados',partsAtrasadas.length,'warn','parts:partsAtrasadas')}
          ${iconRow('✓','Recebidos hoje',partsRecebidasHoje.length,'ok','parts:partsRecebidasHoje')}
        </section>
        ${role()!=='TECNICO'?`<section class="vx-c-list-card vx-c-list-exception"><div class="vx-c-title"><h3>⚠ Gestão por Exceção</h3></div>
          ${iconRow('⚠','OS paradas há mais de 7 dias',oppOverdueRepair.length,'warn','oppOverdueRepair')}
          ${iconRow('⏳','Orçamentos sem resposta há mais de 3 dias',oppApproval.filter(o=>age(o)>3).length,'warn','oppOverdueApproval')}
          ${iconRow('📦','Peças atrasadas',partsAtrasadas.length,'warn','parts:partsAtrasadas')}
          ${iconRow('📥','Aparelhos prontos há mais de 3 dias',oppReadyOverdue3.length,'warn','oppReadyOverdue3')}
          ${iconRow('👤','Clientes com mais de 1 OS aberta',repeatClients,'','repeatClientOrders')}
        </section>`:''}
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-feed-card"><div class="vx-c-title"><h3>◉ Feed em Tempo Real</h3><a href="#" id="vxFeedAll">Ver tudo</a></div>
          ${feed.length?feed.map(h=>`<div class="vx-c-feed-row"><span class="vx-c-feed-dot"></span><div><b>${new Date(h.changed_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b><span>${E(feedText(h))}</span></div></div>`).join(''):'<p class="vx-c-empty">Nenhuma movimentação recente.</p>'}
        </section>
        <section class="vx-c-prod-table-card"><div class="vx-c-title"><h3>★ Produtividade</h3></div>
          <p class="vx-c-prod-total">Total recebido nas OS: <b>${M(totalRecebidoOS)}</b></p>
          <div class="vx-c-tw"><table class="vx-c-prod-table"><thead><tr><th>Técnico</th><th>OS</th><th>Valor Recebido</th><th>Prontos</th><th>Aproveitamento</th></tr></thead>
          <tbody>${prodRows.length?prodRows.map(r=>`<tr><td>${E(r.tech.full_name)}</td><td><button type="button" class="vx-c-prod-cell" data-drill="prodOs_${E(r.tech.id)}" data-title="OS de ${E(r.tech.full_name)}">${r.os}</button></td><td>${M(r.valor)}</td><td><button type="button" class="vx-c-prod-cell" data-drill="prodProntos_${E(r.tech.id)}" data-title="Prontos de ${E(r.tech.full_name)}" ${r.prontos?'':'disabled'}>${r.prontos}</button></td><td>${r.aproveitamento}%</td></tr>`).join(''):'<tr><td colspan="5" class="vx-c-empty">Nenhuma OS atribuída ainda.</td></tr>'}</tbody></table></div>
        </section>
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-goals-card"${role()==='TECNICO'?' style="grid-column:1/-1"':''}><div class="vx-c-title"><h3>Metas e Bonificação</h3></div><div class="vx-c-goals-empty"><span class="vx-c-goals-icon">◷</span><p>Não configurado. Indicadores de meta e bônus só serão exibidos quando houver regra persistida e auditável.</p></div></section>
        ${role()!=='TECNICO'?`<section class="vx-c-fin-card"><div class="vx-c-title"><h3>$ Resumo Financeiro</h3><small>somente pagamentos registrados</small></div>
          <div class="vx-c-fin-grid">
            <div><span>Faturamento realizado (Mês)</span><b>${M(receivedMonth)}</b></div>
            <div><span>A receber</span><b>${M(aReceber)}</b></div>
            <div><span>Média diária</span><b>${M(mediaDiaria)}</b></div>
            <div><span>Ticket médio recebido</span><b>${M(ticketMedioRecebido)}</b></div>
            <div><span>Oportunidade de faturamento</span><b>${M(oportunidadeFaturamento)}</b></div>
            <div><span>Meta do mês</span><b class="vx-c-fin-empty">Não configurado</b></div>
          </div>
        </section>`:''}
      </div>

      ${agendaSectionHtml(agendaSelectedTechId)}

      ${discovery()}
    </div>`;
    app.querySelectorAll('[data-drill]').forEach(el=>el.onclick=(ev)=>{
      ev.preventDefault();
      const k=el.dataset.drill;
      const title=el.dataset.title||el.textContent.trim()||'Detalhamento';
      if(k.startsWith('parts:'))return partsModal(title,partsDrills[k.slice(6)]||[]);
      if(k.startsWith('tasks:'))return tasksModal(title,tasksDrills[k.slice(6)]||[]);
      if(k.startsWith('cases:')||k==='casesAbertos')return casesModal(title,caseDrills[k==='casesAbertos'?'casesAbertos':k.slice(6)]||[],ordersById);
      if(k.startsWith('mycase:')){const c=myCases.find(x=>String(x.id)===k.slice(7));if(c)return caseDetailModal(c,ordersById);return;}
      if(drills[k])modal(title,drills[k]);
    });
    document.getElementById('vxFeedAll').onclick=(ev)=>{ev.preventDefault();feedModal('Feed em Tempo Real',historyScoped,feedText)};
    wireAgendaCard();
  };

  // Achado do usuário em 2026-09-04: pra checar duplicidade e
  // continuar um caso já existente direto do popup de criação
  // (os-detail-v0812.js), o formulário de lá precisa chamar o mesmo
  // caseDetailModal daqui -- exposto uma vez só, no mesmo espírito de
  // window.vxOsStatusLabel/window.vxOpenAgendarForOs já usados nesta
  // sessão pra reaproveitar função de um arquivo em outro sem duplicar.
  window.vxOpenCaseDetail=caseDetailModal;

  window.VoxAssistRuntime=window.VoxAssistRuntime||{};
  window.VoxAssistRuntime.dashboard={name:'Dashboard Canônico V1',version:'2.0.0',owner:'runtime/dashboard-canonical-v1.js'};
})();
