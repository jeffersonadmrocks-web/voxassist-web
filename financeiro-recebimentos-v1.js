/* VoxAssist Web — Reestruturação do módulo FINANCEIRO (2026-09-13).

   O antigo window.renderFinance() (app.js) só lia os_financial
   (ORÇAMENTO: mão de obra/desconto por OS) e nunca tocava em
   `payments` -- ou seja, a tela "Financeiro" do menu nunca mostrava
   nenhum dinheiro de fato recebido. Substituída inteiramente aqui por
   uma tela de RECEBIMENTOS: a unidade principal é a TRANSAÇÃO
   (payments), não a OS -- uma OS de R$1.500 recebida em duas parcelas
   aparece como DUAS linhas no extrato, exatamente como especificado.

   Princípio (mantido igual ao resto do app, ver financePanel() em
   os-detail-v0812.js e o "Resumo Financeiro" de
   runtime/dashboard-canonical-v1.js): ORÇAMENTO (os_financial/os_parts)
   ≠ RECEBIMENTO (payments) ≠ CAIXA (aqui: a própria consolidação por
   período + forma de pagamento desta tela). DESCONTO nunca conta como
   dinheiro recebido -- fecha saldo da OS, não é receita -- por isso
   nunca aparece nesta tela nem entra nos totais, mesma regra já usada
   em todo outro lugar do app.

   payments.service_order_id passou a ser opcional (migration
   20260913080000) pra permitir "RECEBIMENTO AVULSO" (venda de balcão
   sem OS vinculada, ex.: peça avulsa) -- a mesma migration adicionou
   payments.company_id (agora a base real do RLS de payments).

   Fase 2 (decisão do usuário): parar de gravar payments por INSERT
   direto do frontend -- toda criação passa por rpc/register_payment
   (valida empresa ativa, OS×empresa, forma de pagamento e permissão no
   servidor) e todo estorno por rpc/reverse_payment (nunca DELETE/
   UPDATE do valor original -- cria uma NOVA transação negativa
   vinculada via reversal_of_payment_id). O status 'ESTORNO' do estorno
   NÃO entra na lista de status excluídos do extrato/totais de
   propósito -- é o valor negativo dele que zera o líquido
   automaticamente nas somas abaixo, sem precisar de nenhum caso
   especial.

   Fase 3 (etapas 7-9): tela reconstruída como extrato operacional --
   header identifica a EMPRESA ATIVA (nunca Loja/Serra/Vitória: essas
   são EMPRESAS distintas, cada uma só vê a própria); filtros adicionais
   por usuário/forma/situação; colunas Usuário e Situação; clique na
   linha abre um DRAWER de detalhe (nunca oferece EXCLUIR pra um
   RECEBIDO -- só Abrir OS/Comprovante/Auditoria/Estornar, cada um
   condicionado ao que faz sentido pra aquela transação); estorno
   passou de prompt() pra um modal próprio com valor editável (parcial
   nativo) + motivo obrigatório, igual ao padrão adotado em
   vxOpenReversePayment (os-detail-v0812.js). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const CANCELLED = ['CANCELADO', 'CANCELADA', 'ESTORNADO', 'ESTORNADA'];
  // Achado (revisão independente do Financeiro fase 2): register_payment
  // agora grava status='DESCONTO' pra pagamentos com payment_methods.
  // is_discount (migration 20260913100000) -- sinal robusto que não
  // depende do nome exato do método. Checado junto com o método por
  // compatibilidade com linhas gravadas antes dessa migration.
  const isDiscount = (p) => up(p?.method) === 'DESCONTO' || up(p?.status) === 'DESCONTO';
  const isCancelled = (s) => CANCELLED.includes(up(s));
  const hhmm = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
  const dtFull = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '—');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  const BUCKETS = ['Dinheiro', 'PIX', 'Débito', 'Crédito', 'Transferência', 'Outros'];
  function bucketFor(method) {
    const m = up(method);
    if (m === 'DINHEIRO') return 'Dinheiro';
    if (m === 'PIX') return 'PIX';
    if (m.includes('DEBITO') || m.includes('DÉBITO')) return 'Débito';
    if (m.includes('CREDITO') || m.includes('CRÉDITO')) return 'Crédito';
    if (m.includes('TRANSFER')) return 'Transferência';
    return 'Outros';
  }

  // Situação exibida por linha -- nunca string-matching solto: reversal
  // via reversal_of_payment_id (é a própria transação de estorno) e
  // reversal_state (marcado só na linha ORIGINAL) são os dois sinais
  // estruturais gravados pelas RPCs.
  const SITUACAO_LABEL = { RECEBIDO: 'RECEBIDO', ESTORNO: 'ESTORNO', PARCIAL_ESTORNADO: 'PARCIAL ESTORNADO', ESTORNADO: 'ESTORNADO' };
  function situacaoOf(p) {
    if (p.reversal_of_payment_id) return 'ESTORNO';
    if (p.reversal_state === 'TOTAL') return 'ESTORNADO';
    if (p.reversal_state === 'PARCIAL') return 'PARCIAL_ESTORNADO';
    return 'RECEBIDO';
  }

  function rangeFor(preset) {
    const now = new Date();
    if (preset === 'hoje') return [startOfDay(now), endOfDay(now)];
    if (preset === 'ontem') { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
    if (preset === 'semana') { const s = new Date(now); const day = (s.getDay() + 6) % 7; s.setDate(s.getDate() - day); return [startOfDay(s), endOfDay(now)]; }
    if (preset === 'mes') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return [startOfDay(s), endOfDay(now)]; }
    return null;
  }

  // Estado só desta tela (filtro/busca) -- nunca em window.state, que é o
  // contrato global do app (ver PWA-0.1).
  let ui = { range: 'hoje', from: null, to: null, q: '', userId: '', method: '', situacao: '', rows: [], methods: [], users: [], companyName: 'EMPRESA' };

  async function loadPaymentMethods() {
    const rows = await api(`payment_methods?company_id=eq.${state.profile?.active_company_id}&active=eq.true&select=id,name&order=sort_order`).catch(() => []);
    return rows?.length ? rows : [{ name: 'DINHEIRO' }, { name: 'PIX' }, { name: 'CARTÃO DE DÉBITO' }, { name: 'CARTÃO DE CRÉDITO' }, { name: 'CHEQUE' }, { name: 'TRANSFERÊNCIA' }];
  }

  async function loadCompanyName() {
    const id = state.profile?.active_company_id;
    if (!id) return 'EMPRESA';
    const rows = await api(`companies?id=eq.${id}&select=trade_name,legal_name`).catch(() => []);
    return rows?.[0]?.trade_name || rows?.[0]?.legal_name || 'EMPRESA';
  }

  async function loadUsers() {
    return api('profiles?select=id,full_name&active=eq.true&order=full_name').catch(() => []);
  }

  async function loadRows() {
    let from, to;
    if (ui.range === 'periodo') {
      from = ui.from ? startOfDay(new Date(ui.from + 'T00:00:00')) : startOfDay(new Date());
      to = ui.to ? endOfDay(new Date(ui.to + 'T00:00:00')) : endOfDay(new Date());
    } else {
      [from, to] = rangeFor(ui.range) || rangeFor('hoje');
    }
    // company_id explícito (não confiar só na RLS): um usuário pode ter
    // acesso a mais de uma empresa (user_companies) -- aqui só a EMPRESA
    // ATIVA importa, nunca uma Loja/seletor Serra×Vitória (essas são
    // empresas distintas, cada uma só enxerga a própria).
    const rows = await api(`payments?company_id=eq.${state.profile?.active_company_id}&paid_at=gte.${encodeURIComponent(from.toISOString())}&paid_at=lte.${encodeURIComponent(to.toISOString())}&select=*,service_orders(os_number,client_id,clients(name,document)),profiles(full_name)&order=paid_at.desc&limit=2000`).catch(() => []);
    return (rows || []).filter((p) => !isCancelled(p.status) && !isDiscount(p));
  }

  function matchesSearch(p, q) {
    if (!q) return true;
    const hay = [p.service_orders?.os_number, p.service_orders?.clients?.name, p.service_orders?.clients?.document, p.notes]
      .filter(Boolean).join(' ').toUpperCase();
    return hay.includes(q);
  }

  function computeTotals(rows) {
    const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    let total = 0;
    rows.forEach((p) => { const b = bucketFor(p.method); totals[b] += Number(p.amount || 0); total += Number(p.amount || 0); });
    return { totals, total, count: rows.length };
  }

  function rowHtml(p) {
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO';
    const isReversal = !!p.reversal_of_payment_id;
    const situacao = situacaoOf(p);
    return `<tr class="${os ? '' : 'vx-fin-avulso-row'}" onclick="vxFinOpenDrawer('${p.id}')">
      <td>${hhmm(p.paid_at)}</td>
      <td>${os ? esc(os) : '—'}</td>
      <td>${esc(cliente)}</td>
      <td>${esc(p.notes || '—')}</td>
      <td><span class="vx-fin-method-tag">${esc(p.method)}</span></td>
      <td class="vx-fin-amount ${isReversal ? 'vx-fin-reversal-tag' : ''}">${money(p.amount)}</td>
      <td>${esc(p.profiles?.full_name || '—')}</td>
      <td><span class="vx-fin-situacao vx-fin-situacao-${situacao.toLowerCase()}">${SITUACAO_LABEL[situacao]}</span></td>
    </tr>`;
  }

  function totalsHtml(t) {
    return `<div class="vx-fin-totals-grid">${BUCKETS.map((b) => `<div class="vx-fin-total-row"><span>${b}</span><b>${money(t.totals[b])}</b></div>`).join('')}</div>
      <div class="vx-fin-total-line"><span>TOTAL RECEBIDO</span><b>${money(t.total)}</b></div>
      <div class="vx-fin-count">${t.count} lançamento${t.count === 1 ? '' : 's'}</div>`;
  }

  function filteredRows() {
    const q = up(ui.q);
    return ui.rows.filter((p) => matchesSearch(p, q)
      && (!ui.userId || p.created_by === ui.userId)
      && (!ui.method || up(p.method) === up(ui.method))
      && (!ui.situacao || situacaoOf(p) === ui.situacao));
  }

  function repaint() {
    const rows = filteredRows();
    $('#vxFinRows').innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<tr><td colspan="8" class="vx-empty">Nenhum recebimento encontrado neste período.</td></tr>`;
    $('#vxFinTotals').innerHTML = totalsHtml(computeTotals(rows));
  }

  async function reload() {
    ui.rows = await loadRows();
    repaint();
  }

  function openAvulsoModal() {
    document.querySelector('#vxFinAvulsoModal')?.remove();
    const bg = document.createElement('div');
    bg.id = 'vxFinAvulsoModal';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-avulso-modal">
      <h3>RECEBIMENTO AVULSO (SEM OS)</h3>
      <div class="vx-field"><label>DATA</label><input class="vx-control" type="date" id="vxFinAvDate" value="${isoDate()}"></div>
      <div class="vx-field"><label>VALOR (R$)</label><input class="vx-control" type="number" step=".01" min="0.01" id="vxFinAvAmount"></div>
      <div class="vx-field"><label>FORMA DE PAGAMENTO</label><select class="vx-control" id="vxFinAvMethod"><option value=""></option>${ui.methods.filter((m) => up(m.name) !== 'DESCONTO').map((m) => `<option>${esc(m.name)}</option>`).join('')}</select></div>
      <div class="vx-field"><label>DESCRIÇÃO / OBSERVAÇÃO</label><input class="vx-control" id="vxFinAvNotes" placeholder="Ex.: Venda de peça avulsa"></div>
      <div class="vx-modal-actions"><button type="button" data-close>CANCELAR</button><button type="button" class="vx-green-btn" id="vxFinAvSave">SALVAR</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-close]').onclick = close;
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    // Mesma chave de idempotência por abertura do modal -- ver
    // comentário equivalente em vxOpenRegisterPayment (os-detail-v0812.js).
    const idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    const saveBtn = bg.querySelector('#vxFinAvSave');
    saveBtn.onclick = async () => {
      if (saveBtn.disabled) return;
      const amount = Number(String($('#vxFinAvAmount').value || '0').replace(',', '.'));
      const method = $('#vxFinAvMethod').value;
      const dateVal = $('#vxFinAvDate').value || isoDate();
      const notes = up($('#vxFinAvNotes').value || '');
      if (!(amount > 0)) return toast('Informe um valor maior que zero.', 'err');
      if (!method) return toast('Selecione a forma de pagamento.', 'err');
      const paidAt = new Date(dateVal + 'T00:00:00');
      const now = new Date();
      paidAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      saveBtn.disabled = true;
      try {
        await api('rpc/register_payment', {
          method: 'POST',
          body: JSON.stringify({
            p_service_order_id: null,
            p_components: [{ method, amount }],
            p_notes: notes || null,
            p_paid_at: paidAt.toISOString(),
            p_idempotency_key: idempotencyKey,
          }),
        });
        toast('Recebimento avulso registrado.');
        close();
        await reload();
      } catch (e) { toast('Erro ao registrar recebimento: ' + e.message, 'err'); saveBtn.disabled = false; }
    };
  }

  // ---- Etapa 8: drawer de detalhe da transação ----
  // "Saldo resultante" é o saldo da OS logo APÓS esta transação -- soma
  // cumulativa de tudo que já tinha paid_at <= o desta linha (não o
  // saldo atual da OS, que pode já ter mudado por lançamentos
  // posteriores).
  async function computeSaldoResultante(p) {
    if (!p.service_order_id) return null;
    const [finRows, parts, payRows] = await Promise.all([
      api(`os_financial?service_order_id=eq.${p.service_order_id}&select=*`).catch(() => []),
      api(`os_parts?service_order_id=eq.${p.service_order_id}&select=quantity,unit_value`).catch(() => []),
      api(`payments?service_order_id=eq.${p.service_order_id}&select=amount,status,method,paid_at`).catch(() => []),
    ]);
    const fin = finRows?.[0] || {};
    const partsTotal = (parts || []).reduce((s, x) => s + Number(x.quantity || 0) * Number(x.unit_value || 0), 0);
    const budget = partsTotal + Number(fin.labor_value || 0) + Number(fin.freight_value || 0) + Number(fin.auxiliary_material_value || 0) + Number(fin.technical_report_value || 0) - Number(fin.discount_value || 0);
    const cutoff = new Date(p.paid_at).getTime();
    const allocated = (payRows || [])
      .filter((x) => !isCancelled(x.status) && new Date(x.paid_at).getTime() <= cutoff)
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    return budget - allocated;
  }

  async function loadAuditLog(paymentId) {
    return api(`audit_log?entity_type=eq.PAYMENT&entity_id=eq.${paymentId}&select=*,profiles(full_name)&order=created_at.desc`).catch(() => []);
  }

  function auditActionLabel(a) {
    if (a === 'REGISTRAR_RECEBIMENTO') return 'Recebimento registrado';
    if (a === 'ESTORNAR_RECEBIMENTO') return 'Estorno registrado';
    return a || '—';
  }

  function closeDrawer() { document.querySelector('#vxFinDrawer')?.remove(); }

  window.vxFinOpenDrawer = async function (paymentId) {
    const p = ui.rows.find((x) => x.id === paymentId);
    if (!p) return;
    closeDrawer();
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO (sem OS)';
    const situacao = situacaoOf(p);
    const already = ui.rows.filter((x) => x.reversal_of_payment_id === p.id).reduce((s, x) => s + Math.abs(Number(x.amount || 0)), 0);
    const remaining = Number(p.amount || 0) - already;
    // Estorno parcial é nativo: um lançamento já PARCIAL_ESTORNADO ainda
    // pode receber outro estorno até zerar o restante -- só bloqueia um
    // ESTORNO (linha negativa em si) ou algo já TOTALmente estornado.
    const canReverse = !p.reversal_of_payment_id && remaining > 0.004;

    const bg = document.createElement('div');
    bg.id = 'vxFinDrawer';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-drawer">
      <h3>DETALHE DO LANÇAMENTO</h3>
      <div class="vx-fin-drawer-grid">
        <div><span>OS</span><b>${os ? esc(os) : 'SEM OS (AVULSO)'}</b></div>
        <div><span>CLIENTE</span><b>${esc(cliente)}</b></div>
        <div><span>VALOR NESTA TRANSAÇÃO</span><b class="${Number(p.amount) < 0 ? 'vx-fin-reversal-tag' : ''}">${money(p.amount)}</b></div>
        <div><span>FORMA</span><b>${esc(p.method)}</b></div>
        <div><span>DATA/HORA</span><b>${dtFull(p.paid_at)}</b></div>
        <div><span>USUÁRIO</span><b>${esc(p.profiles?.full_name || '—')}</b></div>
        <div><span>EMPRESA</span><b>${esc(ui.companyName)}</b></div>
        <div><span>OPERATION ID</span><b class="vx-fin-mono">${esc(p.operation_id || '—')}</b></div>
        <div><span>SITUAÇÃO</span><b>${SITUACAO_LABEL[situacao]}${p.reversal_state === 'PARCIAL' ? ` (restam ${money(remaining)} p/ estornar)` : ''}</b></div>
        <div><span>VALOR DA OS</span><b id="vxFinDrawerBudget">carregando…</b></div>
        <div><span>SALDO RESULTANTE</span><b id="vxFinDrawerSaldo">carregando…</b></div>
      </div>
      <div><span class="vx-fin-drawer-label">OBSERVAÇÃO</span><p class="vx-fin-drawer-notes">${esc(p.notes || '—')}</p></div>
      ${p.reversal_of_payment_id ? `<div class="vx-fin-drawer-note-box">Este lançamento é o ESTORNO de outra transação (id ${esc(p.reversal_of_payment_id)}).</div>` : ''}
      <div id="vxFinDrawerAudit" class="vx-fin-drawer-audit"></div>
      <div class="vx-modal-actions" style="justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${os ? `<button type="button" id="vxFinDrawerOpenOs">ABRIR OS</button>` : ''}
          <button type="button" id="vxFinDrawerReceipt">COMPROVANTE</button>
          <button type="button" id="vxFinDrawerAuditBtn">AUDITORIA</button>
          ${canReverse ? `<button type="button" class="vx-orange-btn" id="vxFinDrawerReverse">ESTORNAR</button>` : ''}
        </div>
        <button type="button" data-close>FECHAR</button>
      </div>
    </div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick = closeDrawer;
    bg.addEventListener('click', (e) => { if (e.target === bg) closeDrawer(); });
    if (os) bg.querySelector('#vxFinDrawerOpenOs').onclick = () => { closeDrawer(); render(`os:${p.service_order_id}`); };
    bg.querySelector('#vxFinDrawerReceipt').onclick = () => openReceipt(p, cliente, os);
    bg.querySelector('#vxFinDrawerAuditBtn').onclick = async () => {
      const box = bg.querySelector('#vxFinDrawerAudit');
      box.innerHTML = 'Carregando auditoria…';
      const logs = await loadAuditLog(p.id);
      box.innerHTML = logs.length
        ? `<h4>AUDITORIA</h4><ul>${logs.map((l) => `<li>${dtFull(l.created_at)} — ${esc(auditActionLabel(l.action))} — ${esc(l.profiles?.full_name || '—')}</li>`).join('')}</ul>`
        : '<h4>AUDITORIA</h4><p class="vx-empty">Nenhum registro de auditoria encontrado.</p>';
    };
    if (canReverse) bg.querySelector('#vxFinDrawerReverse').onclick = () => openReverseModal(p, remaining);

    computeSaldoResultante(p).then((saldo) => {
      if (saldo === null) {
        bg.querySelector('#vxFinDrawerBudget').textContent = '—';
        bg.querySelector('#vxFinDrawerSaldo').textContent = '—';
      } else {
        bg.querySelector('#vxFinDrawerSaldo').textContent = money(saldo);
      }
    });
    // Valor da OS (orçamento) mostrado à parte -- reaproveita a mesma
    // consulta pra não duplicar chamadas de rede.
    if (p.service_order_id) {
      Promise.all([
        api(`os_financial?service_order_id=eq.${p.service_order_id}&select=*`).catch(() => []),
        api(`os_parts?service_order_id=eq.${p.service_order_id}&select=quantity,unit_value`).catch(() => []),
      ]).then(([finRows, parts]) => {
        const fin = finRows?.[0] || {};
        const partsTotal = (parts || []).reduce((s, x) => s + Number(x.quantity || 0) * Number(x.unit_value || 0), 0);
        const budget = partsTotal + Number(fin.labor_value || 0) + Number(fin.freight_value || 0) + Number(fin.auxiliary_material_value || 0) + Number(fin.technical_report_value || 0) - Number(fin.discount_value || 0);
        bg.querySelector('#vxFinDrawerBudget').textContent = money(budget);
      });
    } else {
      bg.querySelector('#vxFinDrawerBudget').textContent = '—';
    }
  };

  function openReceipt(p, cliente, os) {
    document.querySelector('#vxFinReceipt')?.remove();
    const box = document.createElement('div');
    box.id = 'vxFinReceipt';
    box.className = 'vx-fin-receipt-print';
    box.innerHTML = `<div class="vx-fin-receipt-box">
      <h2>${esc(ui.companyName)}</h2>
      <h3>COMPROVANTE DE RECEBIMENTO</h3>
      <p>OS: ${os ? esc(os) : 'AVULSO (SEM OS)'}</p>
      <p>Cliente: ${esc(cliente)}</p>
      <p>Valor: ${money(p.amount)}</p>
      <p>Forma: ${esc(p.method)}</p>
      <p>Data/Hora: ${dtFull(p.paid_at)}</p>
      <p>Usuário: ${esc(p.profiles?.full_name || '—')}</p>
      <p>Observação: ${esc(p.notes || '—')}</p>
      <div class="vx-fin-receipt-actions"><button type="button" onclick="window.print()">IMPRIMIR</button><button type="button" onclick="document.querySelector('#vxFinReceipt').remove()">FECHAR</button></div>
    </div>`;
    document.body.appendChild(box);
  }

  // ---- Estorno (modal próprio, valor editável -- parcial nativo) ----
  function openReverseModal(p, remaining) {
    document.querySelector('#vxFinReverseModal')?.remove();
    const bg = document.createElement('div');
    bg.id = 'vxFinReverseModal';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-avulso-modal">
      <h3>ESTORNAR RECEBIMENTO</h3>
      <div class="vx-field"><label>VALOR A ESTORNAR (R$) — disponível: ${money(remaining)}</label><input class="vx-control" type="number" step=".01" min="0.01" max="${remaining}" id="vxFinRevAmount" value="${remaining.toFixed(2)}"></div>
      <div class="vx-field"><label>MOTIVO</label><input class="vx-control" id="vxFinRevReason" placeholder="Obrigatório"></div>
      <div class="vx-modal-actions"><button type="button" data-close>CANCELAR</button><button type="button" class="vx-orange-btn" id="vxFinRevConfirm">ESTORNAR</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-close]').onclick = close;
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    bg.querySelector('#vxFinRevConfirm').onclick = async () => {
      const amount = Number(String($('#vxFinRevAmount', bg).value || '0').replace(',', '.'));
      const reason = up($('#vxFinRevReason', bg).value || '');
      if (!(amount > 0)) return toast('Informe um valor maior que zero.', 'err');
      if (amount > remaining + 0.004) return toast(`Valor não pode ultrapassar o disponível (${money(remaining)}).`, 'err');
      if (!reason) return toast('Informe o motivo do estorno.', 'err');
      if (!confirm(`Estornar ${money(amount)}?`)) return;
      try {
        await api('rpc/reverse_payment', { method: 'POST', body: JSON.stringify({ p_payment_id: p.id, p_reason: reason, p_amount: amount }) });
        toast('Estorno registrado.');
        close();
        closeDrawer();
        await reload();
      } catch (e) { toast('Erro ao estornar: ' + e.message, 'err'); }
    };
  }

  window.renderFinance = async function () {
    if (typeof can === 'function' && !can('financeiro')) {
      $('#app').innerHTML = `<div class="card error-card"><h3>Acesso restrito</h3><p>Seu perfil não tem acesso ao Financeiro.</p></div>`;
      return;
    }
    [ui.methods, ui.companyName, ui.users] = await Promise.all([loadPaymentMethods(), loadCompanyName(), loadUsers()]);
    $('#app').innerHTML = `<div class="vx-fin-wrap">
      <div class="vx-fin-head"><div><h2>RECEBIMENTOS · ${esc(ui.companyName)}</h2><span class="vx-fin-date">${new Date().toLocaleDateString('pt-BR')}</span></div>
        <button type="button" class="vx-fin-btn primary" id="vxFinNewAvulso">+ RECEBIMENTO AVULSO</button></div>
      <div class="vx-fin-filters">
        <div class="vx-fin-chips">${['hoje', 'ontem', 'semana', 'mes', 'periodo'].map((r) => `<button type="button" data-range="${r}" class="${r === ui.range ? 'active' : ''}">${{ hoje: 'Hoje', ontem: 'Ontem', semana: 'Semana', mes: 'Mês', periodo: 'Período' }[r]}</button>`).join('')}</div>
        <div class="vx-fin-period-inputs ${ui.range === 'periodo' ? '' : 'hidden'}" id="vxFinPeriodBox">
          <input class="vx-control" type="date" id="vxFinFrom" value="${ui.from || isoDate()}">
          <input class="vx-control" type="date" id="vxFinTo" value="${ui.to || isoDate()}">
          <button type="button" id="vxFinApplyPeriod">APLICAR</button>
        </div>
        <div class="vx-fin-search"><input class="vx-control" id="vxFinSearch" placeholder="🔎 Pesquisar OS, cliente, CPF/CNPJ..." value="${esc(ui.q)}"></div>
      </div>
      <div class="vx-fin-filters">
        <select class="vx-control" id="vxFinFilterUser"><option value="">Usuário (todos)</option>${ui.users.map((u) => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select>
        <select class="vx-control" id="vxFinFilterMethod"><option value="">Forma (todas)</option>${ui.methods.filter((m) => up(m.name) !== 'DESCONTO').map((m) => `<option>${esc(m.name)}</option>`).join('')}</select>
        <select class="vx-control" id="vxFinFilterSituacao"><option value="">Situação (todas)</option><option value="RECEBIDO">Recebido</option><option value="PARCIAL_ESTORNADO">Parcial estornado</option><option value="ESTORNADO">Estornado</option><option value="ESTORNO">Estorno (lançamento)</option></select>
      </div>
      <div class="vx-fin-table-wrap"><table class="vx-fin-table"><thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Usuário</th><th>Situação</th></tr></thead><tbody id="vxFinRows"></tbody></table></div>
      <div class="vx-fin-totals-box"><h3>RECEBIMENTOS DO PERÍODO</h3><div id="vxFinTotals"></div></div>
    </div>`;

    $$('.vx-fin-chips [data-range]').forEach((b) => b.onclick = () => {
      ui.range = b.dataset.range;
      $$('.vx-fin-chips [data-range]').forEach((x) => x.classList.toggle('active', x === b));
      $('#vxFinPeriodBox').classList.toggle('hidden', ui.range !== 'periodo');
      if (ui.range !== 'periodo') reload();
    });
    $('#vxFinApplyPeriod').onclick = () => { ui.from = $('#vxFinFrom').value; ui.to = $('#vxFinTo').value; reload(); };
    $('#vxFinSearch').oninput = (e) => { ui.q = e.target.value; repaint(); };
    $('#vxFinFilterUser').onchange = (e) => { ui.userId = e.target.value; repaint(); };
    $('#vxFinFilterMethod').onchange = (e) => { ui.method = e.target.value; repaint(); };
    $('#vxFinFilterSituacao').onchange = (e) => { ui.situacao = e.target.value; repaint(); };
    $('#vxFinNewAvulso').onclick = openAvulsoModal;

    await reload();
  };
})();
