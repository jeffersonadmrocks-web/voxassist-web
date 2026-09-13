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
   especial. */
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
  let ui = { range: 'hoje', from: null, to: null, q: '', rows: [], methods: [] };

  async function loadPaymentMethods() {
    const rows = await api(`payment_methods?company_id=eq.${state.profile?.active_company_id}&active=eq.true&select=id,name&order=sort_order`).catch(() => []);
    return rows?.length ? rows : [{ name: 'DINHEIRO' }, { name: 'PIX' }, { name: 'CARTÃO DE DÉBITO' }, { name: 'CARTÃO DE CRÉDITO' }, { name: 'CHEQUE' }, { name: 'TRANSFERÊNCIA' }];
  }

  async function loadRows() {
    let from, to;
    if (ui.range === 'periodo') {
      from = ui.from ? startOfDay(new Date(ui.from + 'T00:00:00')) : startOfDay(new Date());
      to = ui.to ? endOfDay(new Date(ui.to + 'T00:00:00')) : endOfDay(new Date());
    } else {
      [from, to] = rangeFor(ui.range) || rangeFor('hoje');
    }
    const rows = await api(`payments?paid_at=gte.${encodeURIComponent(from.toISOString())}&paid_at=lte.${encodeURIComponent(to.toISOString())}&select=*,service_orders(os_number,clients(name,document))&order=paid_at.desc&limit=2000`).catch(() => []);
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
    const canReverse = !isReversal && up(p.status) === 'RECEBIDO' && p.reversal_state !== 'TOTAL';
    const desc = isReversal ? `<span class="vx-fin-reversal-tag">ESTORNO</span> ${esc(p.notes || '—')}` : `${esc(p.notes || '—')}${p.reversal_state ? ` <small class="vx-fin-reversal-tag">(${p.reversal_state === 'TOTAL' ? 'estornado' : 'parc. estornado'})</small>` : ''}`;
    return `<tr class="${os ? '' : 'vx-fin-avulso-row'}">
      <td ${os ? `onclick="render('os:${p.service_order_id}')" style="cursor:pointer"` : ''}>${hhmm(p.paid_at)}</td>
      <td ${os ? `onclick="render('os:${p.service_order_id}')" style="cursor:pointer"` : ''}>${os ? esc(os) : '—'}</td>
      <td>${esc(cliente)}</td>
      <td>${desc}</td>
      <td><span class="vx-fin-method-tag">${esc(p.method)}</span></td>
      <td class="vx-fin-amount ${isReversal ? 'vx-fin-reversal-tag' : ''}">${money(p.amount)}</td>
      <td>${canReverse ? `<button type="button" class="vx-fin-reverse-btn" data-reverse="${p.id}" data-amount="${p.amount}" data-method="${esc(p.method)}">ESTORNAR</button>` : ''}</td>
    </tr>`;
  }

  function totalsHtml(t) {
    return `<div class="vx-fin-totals-grid">${BUCKETS.map((b) => `<div class="vx-fin-total-row"><span>${b}</span><b>${money(t.totals[b])}</b></div>`).join('')}</div>
      <div class="vx-fin-total-line"><span>TOTAL</span><b>${money(t.total)}</b></div>
      <div class="vx-fin-count">${t.count} recebimento${t.count === 1 ? '' : 's'}</div>`;
  }

  function filteredRows() {
    const q = up(ui.q);
    return ui.rows.filter((p) => matchesSearch(p, q));
  }

  function repaint() {
    const rows = filteredRows();
    $('#vxFinRows').innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<tr><td colspan="7" class="vx-empty">Nenhum recebimento encontrado neste período.</td></tr>`;
    $('#vxFinTotals').innerHTML = totalsHtml(computeTotals(rows));
    $$('[data-reverse]').forEach((btn) => btn.onclick = (e) => {
      e.stopPropagation();
      reversePaymentPrompt(btn.dataset.reverse, Number(btn.dataset.amount), btn.dataset.method);
    });
  }

  // Fase 2: estorno = nova transação vinculada (rpc/reverse_payment),
  // nunca DELETE/UPDATE da linha original -- ver comentário do topo.
  async function reversePaymentPrompt(paymentId, amount, method) {
    const reason = up(prompt(`Motivo do estorno de ${money(amount)} (${method}):`) || '');
    if (!reason) return toast('Informe o motivo do estorno.', 'err');
    if (!confirm(`Estornar ${money(amount)} (${method})?`)) return;
    try {
      await api('rpc/reverse_payment', { method: 'POST', body: JSON.stringify({ p_payment_id: paymentId, p_reason: reason }) });
      toast('Estorno registrado.');
      await reload();
    } catch (e) { toast('Erro ao estornar: ' + e.message, 'err'); }
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
    bg.querySelector('#vxFinAvSave').onclick = async () => {
      const amount = Number(String($('#vxFinAvAmount').value || '0').replace(',', '.'));
      const method = $('#vxFinAvMethod').value;
      const dateVal = $('#vxFinAvDate').value || isoDate();
      const notes = up($('#vxFinAvNotes').value || '');
      if (!(amount > 0)) return toast('Informe um valor maior que zero.', 'err');
      if (!method) return toast('Selecione a forma de pagamento.', 'err');
      const paidAt = new Date(dateVal + 'T00:00:00');
      const now = new Date();
      paidAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      try {
        await api('rpc/register_payment', {
          method: 'POST',
          body: JSON.stringify({
            p_service_order_id: null,
            p_components: [{ method, amount }],
            p_notes: notes || null,
            p_paid_at: paidAt.toISOString(),
          }),
        });
        toast('Recebimento avulso registrado.');
        close();
        await reload();
      } catch (e) { toast('Erro ao registrar recebimento: ' + e.message, 'err'); }
    };
  }

  window.renderFinance = async function () {
    if (typeof can === 'function' && !can('financeiro')) {
      $('#app').innerHTML = `<div class="card error-card"><h3>Acesso restrito</h3><p>Seu perfil não tem acesso ao Financeiro.</p></div>`;
      return;
    }
    ui.methods = await loadPaymentMethods();
    $('#app').innerHTML = `<div class="vx-fin-wrap">
      <div class="vx-fin-head"><div><h2>RECEBIMENTOS</h2><span class="vx-fin-date">${new Date().toLocaleDateString('pt-BR')}</span></div>
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
      <div class="vx-fin-table-wrap"><table class="vx-fin-table"><thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Descrição</th><th>Forma</th><th>Valor</th><th></th></tr></thead><tbody id="vxFinRows"></tbody></table></div>
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
    $('#vxFinNewAvulso').onclick = openAvulsoModal;

    await reload();
  };
})();
