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

  // Achado do usuário (2026-09-13): o estorno já existia e funcionava,
  // mas ficava pouco perceptível -- tela abria em "Hoje" (sem
  // lançamentos), a ação só existia dentro do menu ⋮, e não havia
  // nenhum sinal de PERMISSÃO na UI (só o backend barrava). Mesmo padrão
  // de gate client-side já usado em os-cancel-v0812.js (isManager +
  // consulta a user_permissions) -- nunca criou tabela/RPC nova, só lê o
  // que já existe. É só conveniência de UX: quem tenta burlar via
  // DOM/console ainda esbarra em reverse_payment/RLS no servidor.
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('_', ' ').trim();
  const isManager = () => ['GESTOR', 'ADMIN', 'ADMINISTRADOR'].includes(norm(state?.profile?.role));
  // "Corrigir forma de pagamento" \u00e9 GESTOR estrito (decis\u00e3o do usu\u00e1rio,
  // 2026-09-14) -- diferente de isManager() (que tamb\u00e9m aceita
  // ADMIN/ADMINISTRADOR), nunca por permiss\u00e3o granular. Mesma checagem
  // exata que o backend (correct_payment_method) faz -- s\u00f3 pra n\u00e3o
  // mostrar a a\u00e7\u00e3o pra quem o servidor rejeitaria de qualquer forma.
  const isGestorStrict = () => norm(state?.profile?.role) === 'GESTOR';
  async function userCanReverse() {
    if (isManager()) return true;
    try {
      const uid = state?.session?.user?.id;
      if (!uid) return false;
      const r = await api(`user_permissions?user_id=eq.${encodeURIComponent(uid)}&permission_key=eq.financeiro.reverse&allowed=eq.true&select=id&limit=1`);
      return !!r?.length;
    } catch (e) { return false; }
  }

  const RANGE_KEY = 'vx_fin_last_range';
  function loadLastRange() { try { return localStorage.getItem(RANGE_KEY) || 'mes'; } catch (e) { return 'mes'; } }
  function saveLastRange(r) { try { localStorage.setItem(RANGE_KEY, r); } catch (e) { /* per-viewer conveniência apenas */ } }
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

  // Quanto ainda pode ser estornado de p (amount - soma dos estornos já
  // ligados a ele). Único ponto de cálculo -- usado pela linha (menu ⋮),
  // pelo drawer e pelo modal de estorno, pra nunca divergir entre eles.
  function remainingFor(p) {
    const already = ui.rows.filter((x) => x.reversal_of_payment_id === p.id).reduce((s, x) => s + Math.abs(Number(x.amount || 0)), 0);
    return Number(p.amount || 0) - already;
  }
  function canReverseRow(p) {
    return !p.reversal_of_payment_id && remainingFor(p) > 0.004;
  }

  // Estruturalmente correto pra correct_payment_method (migration
  // 20260914050000) -- espelha as mesmas checagens do backend (status
  // RECEBIDO, não é estorno, não foi estornado) só pra não mostrar a
  // ação pra quem o servidor rejeitaria. GESTOR estrito é checado à
  // parte (isGestorStrict()) em cada ponto de uso.
  function canCorrectMethod(p) {
    return up(p.status) === 'RECEBIDO' && !p.reversal_of_payment_id && !p.reversal_state;
  }

  // Asterisco discreto (pedido do usuário) na forma de um pagamento
  // vigente que resultou de uma correção -- correction_of_payment_id
  // só existe na linha NOVA criada por correct_payment_method.
  function methodLabel(p) {
    if (!p.correction_of_payment_id) return esc(p.method);
    return `${esc(p.method)} <span class="vx-fin-corrected-mark" title="Pagamento com informações corrigidas">*</span>`;
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
  let ui = { range: loadLastRange(), from: null, to: null, q: '', userId: '', method: '', situacao: '', sortBy: 'horario', rows: [], methods: [], users: [], companyName: 'EMPRESA', canReverse: false };

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
    // payments_operational (migration 20260914050000), não payments --
    // filtra as linhas internas de uma correção de forma (estorno
    // interno + original superada), pra um recebimento corrigido
    // aparecer como UMA linha só, nunca duas nem valor em dobro. Um
    // estorno de verdade (reverse_payment) não é afetado por esse
    // filtro e continua aparecendo como sempre.
    const rows = await api(`payments_operational?company_id=eq.${state.profile?.active_company_id}&paid_at=gte.${encodeURIComponent(from.toISOString())}&paid_at=lte.${encodeURIComponent(to.toISOString())}&select=*,service_orders(os_number,client_id,clients(name,document)),profiles(full_name)&order=paid_at.desc&limit=2000`).catch(() => []);
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

  // ---- Separação diária (achado do usuário: lista contínua misturava
  // dias, dificultando conferência) ----
  // Chave de dia SEMPRE pelo calendário LOCAL do navegador (mesmo critério
  // já usado por hhmm/dtFull ao formatar) -- nunca a data UTC crua, que
  // divergiria do horário mostrado em cada linha perto da virada do dia.
  const byTimeAsc = (a, b) => new Date(a.paid_at) - new Date(b.paid_at);
  function dayKey(v) {
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Um único agrupamento por dia serve tanto pra período de vários dias
  // quanto de um único dia (item 14 do pedido) -- sem caminho especial.
  function buildDayGroups(rows) {
    const map = new Map();
    rows.forEach((p) => {
      const key = dayKey(p.paid_at);
      if (!map.has(key)) map.set(key, { key, rows: [] });
      map.get(key).rows.push(p);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  // "Organizar por" reordena/subagrupa SÓ dentro do dia -- a data
  // continua sendo sempre o 1º nível quando há mais de um dia. Nunca
  // consolida linhas: cada pagamento individual continua com sua própria
  // <tr> (e seu próprio menu ⋮), só muda a ordem/os cabeçalhos de
  // subgrupo em volta delas.
  function orderWithinDay(rows, sortBy) {
    if (sortBy === 'forma') {
      const groups = BUCKETS
        .map((b) => ({ label: b, rows: rows.filter((p) => bucketFor(p.method) === b).sort(byTimeAsc) }))
        .filter((g) => g.rows.length);
      return { kind: 'grouped', groups };
    }
    if (sortBy === 'os') {
      const order = []; const map = new Map();
      rows.slice().sort(byTimeAsc).forEach((p) => {
        const os = p.service_orders?.os_number;
        const key = os || '__SEM_OS__';
        if (!map.has(key)) { map.set(key, { label: os ? `OS ${os}` : 'SEM OS (AVULSO)', rows: [] }); order.push(key); }
        map.get(key).rows.push(p);
      });
      return { kind: 'grouped', groups: order.map((k) => map.get(k)) };
    }
    // 'horario' (padrão): cronológico ascendente dentro do dia.
    return { kind: 'flat', rows: rows.slice().sort(byTimeAsc) };
  }
  // Fechamento de CADA dia -- reaproveita a MESMA computeTotals() do
  // bloco "Recebimentos do período", só que escopada às linhas daquele
  // dia. Como cada linha pertence a exatamente um grupo de dia, a soma
  // dos totais diários reconcilia matematicamente com o total do
  // período por construção (mesma função, partição exaustiva).
  function dayTotalHtml(rows, shortLabel) {
    const t = computeTotals(rows);
    const parts = BUCKETS.map((b) => `<span class="vx-fin-day-total-item">${b} <b>${money(t.totals[b])}</b></span>`).join('');
    return `<tr class="vx-fin-day-total-row"><td colspan="9">
      <span class="vx-fin-day-total-label">TOTAL DIA ${esc(shortLabel)}</span>
      <span class="vx-fin-day-total-breakdown">${parts}</span>
      <span class="vx-fin-day-total-final">TOTAL <b>${money(t.total)}</b></span>
    </td></tr>`;
  }

  function rowHtml(p) {
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO';
    const isReversal = !!p.reversal_of_payment_id;
    const situacao = situacaoOf(p);
    // Só a linha TOTALMENTE estornada fica riscada/atenuada por inteiro
    // (ela deixou de existir financeiramente) -- uma PARCIAL_ESTORNADO
    // ainda representa dinheiro de verdade (o restante não estornado) e
    // continua contando nos totais por esse restante, então não é
    // riscada. A célula de Situação nunca é riscada (precisa continuar
    // legível pra dizer exatamente o que aconteceu).
    const fullyReversed = situacao === 'ESTORNADO';
    // canRev = pode ser estornado ESTRUTURALMENTE (canReverseRow) E o
    // usuário logado TEM a permissão (ui.canReverse) -- sem a segunda
    // parte, um usuário sem financeiro.reverse via a ação normalmente e
    // só descobria que não podia ao clicar (erro do servidor).
    const canRev = canReverseRow(p) && ui.canReverse;
    const canCorrect = isGestorStrict() && canCorrectMethod(p);
    return `<tr class="${os ? '' : 'vx-fin-avulso-row'}${fullyReversed ? ' vx-fin-row-reversed' : ''}" onclick="vxFinOpenDrawer('${p.id}')">
      <td>${hhmm(p.paid_at)}</td>
      <td>${os ? esc(os) : '—'}</td>
      <td>${esc(cliente)}</td>
      <td>${esc(p.notes || '—')}</td>
      <td><span class="vx-fin-method-tag">${methodLabel(p)}</span></td>
      <td class="vx-fin-amount ${isReversal ? 'vx-fin-reversal-tag' : ''}">${money(p.amount)}</td>
      <td>${esc(p.profiles?.full_name || '—')}</td>
      <td class="vx-fin-situacao-cell"><span class="vx-fin-situacao vx-fin-situacao-${situacao.toLowerCase()}">${SITUACAO_LABEL[situacao]}</span></td>
      <td class="vx-fin-actions-cell" onclick="event.stopPropagation()">
        <button type="button" class="vx-fin-kebab" onclick="vxFinToggleMenu('${p.id}')" aria-label="Ações">⋮</button>
        <div class="vx-fin-menu" id="vxFinMenu-${p.id}" hidden>
          <button type="button" onclick="vxFinOpenDrawer('${p.id}')">Ver detalhes</button>
          ${canRev ? `<button type="button" class="vx-fin-menu-danger" onclick="vxFinQuickReverse('${p.id}')">Estornar recebimento</button>` : ''}
          ${canCorrect ? `<button type="button" onclick="vxFinOpenCorrectMethod('${p.id}')">Corrigir forma de pagamento</button>` : ''}
        </div>
      </td>
    </tr>`;
  }

  const RANGE_LABEL = { hoje: 'Hoje', ontem: 'Ontem', semana: 'Semana', mes: 'Mês', periodo: 'no período selecionado' };
  function emptyMessage() {
    const label = RANGE_LABEL[ui.range] || 'no período selecionado';
    const hasOtherFilters = !!(ui.q || ui.userId || ui.method || ui.situacao);
    if (hasOtherFilters) return `Nenhum recebimento encontrado com os filtros aplicados em "${label}". Tente limpar os filtros ou ampliar o período.`;
    if (ui.range === 'hoje' || ui.range === 'ontem' || ui.range === 'semana') return `Nenhum recebimento encontrado em "${label}". Experimente o filtro "Mês" para ver o histórico recente.`;
    return `Nenhum recebimento encontrado em "${label}".`;
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

  // Monta o corpo da tabela: um bloco por DIA (cabeçalho + linhas + fechamento
  // do dia), na ordem em que os dias aparecem (sempre crescente -- ver
  // buildDayGroups). Dentro de cada dia, ui.sortBy decide se as linhas ficam
  // num fluxo cronológico único ou subagrupadas por forma/OS -- em
  // qualquer caso, rowHtml(p) é reaproveitada sem alteração (menu ⋮,
  // permissão de estorno, riscado de estornado etc. continuam intactos).
  function dayBlockHtml(day) {
    const full = new Date(day.rows[0].paid_at).toLocaleDateString('pt-BR');
    const short = full.slice(0, 5);
    const ordered = orderWithinDay(day.rows, ui.sortBy);
    const rowsHtml = ordered.kind === 'flat'
      ? ordered.rows.map(rowHtml).join('')
      : ordered.groups.map((g) => `<tr class="vx-fin-subgroup-row"><td colspan="9">${esc(g.label)}</td></tr>${g.rows.map(rowHtml).join('')}`).join('');
    return `<tr class="vx-fin-day-header-row"><td colspan="9">${esc(full)}</td></tr>${rowsHtml}${dayTotalHtml(day.rows, short)}`;
  }

  function repaint() {
    const rows = filteredRows();
    const showGoMonth = !rows.length && ui.range !== 'mes' && ui.range !== 'periodo';
    $('#vxFinRows').innerHTML = rows.length
      ? buildDayGroups(rows).map(dayBlockHtml).join('')
      : `<tr><td colspan="9" class="vx-empty">${esc(emptyMessage())}${showGoMonth ? ' <button type="button" class="vx-fin-link-btn" id="vxFinGoMonth">Ver mês</button>' : ''}</td></tr>`;
    $('#vxFinTotals').innerHTML = totalsHtml(computeTotals(rows));
    if (showGoMonth) {
      $('#vxFinGoMonth').onclick = () => {
        ui.range = 'mes';
        saveLastRange('mes');
        $$('.vx-fin-chips [data-range]').forEach((x) => x.classList.toggle('active', x.dataset.range === 'mes'));
        $('#vxFinPeriodBox').classList.add('hidden');
        reload();
      };
    }
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
      api(`payments_operational?service_order_id=eq.${p.service_order_id}&select=amount,status,method,paid_at`).catch(() => []),
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

  // Anda a cadeia de correção pra trás via correction_of_payment_id
  // (só existe na linha NOVA/vigente) até a origem -- cada elo lê o
  // método da linha ANTERIOR (raw `payments`, nunca payments_operational
  // -- a original superada não aparece na view operacional de propósito)
  // e o motivo/gestor/data já gravados na linha ATUAL (correction_reason/
  // correction_by/correction_at, direto no INSERT de correct_payment_method).
  // correction_by é uuid solto (sem FK -- ver comentário na migration
  // 20260914050000, pra não ambiguar o embed profiles(full_name) já
  // usado em todo lugar), por isso o nome do gestor é buscado à parte.
  async function loadCorrectionHistory(p) {
    const chain = [];
    let current = p;
    const gestorCache = new Map();
    while (current?.correction_of_payment_id) {
      const prevRows = await api(`payments?id=eq.${current.correction_of_payment_id}&select=id,method,amount,correction_of_payment_id`).catch(() => []);
      const prev = prevRows?.[0];
      if (!prev) break;
      let gestor = '—';
      if (current.correction_by) {
        if (!gestorCache.has(current.correction_by)) {
          const rows = await api(`profiles?id=eq.${current.correction_by}&select=full_name`).catch(() => []);
          gestorCache.set(current.correction_by, rows?.[0]?.full_name || '—');
        }
        gestor = gestorCache.get(current.correction_by);
      }
      chain.unshift({ from: prev.method, to: current.method, amount: current.amount, reason: current.correction_reason, gestor, at: current.correction_at });
      current = prev;
    }
    return chain;
  }

  function auditActionLabel(a) {
    if (a === 'REGISTRAR_RECEBIMENTO') return 'Recebimento registrado';
    if (a === 'ESTORNAR_RECEBIMENTO') return 'Estorno registrado';
    return a || '—';
  }

  function closeDrawer() { document.querySelector('#vxFinDrawer')?.remove(); }

  function closeAllMenus() { document.querySelectorAll('.vx-fin-menu').forEach((m) => { m.hidden = true; }); }
  window.vxFinToggleMenu = function (id) {
    const target = document.querySelector(`#vxFinMenu-${id}`);
    const willOpen = !!(target && target.hidden);
    closeAllMenus();
    if (target) target.hidden = !willOpen;
  };
  window.vxFinQuickReverse = function (id) {
    closeAllMenus();
    const p = ui.rows.find((x) => x.id === id);
    if (!p) return;
    if (!ui.canReverse) return toast('Você não tem a permissão financeiro.reverse para estornar recebimentos.', 'err');
    const remaining = remainingFor(p);
    if (!canReverseRow(p)) return toast('Este lançamento não pode ser estornado.', 'err');
    openReverseModal(p, remaining);
  };
  window.vxFinOpenCorrectMethod = function (id) {
    closeAllMenus();
    const p = ui.rows.find((x) => x.id === id);
    if (!p) return;
    if (!isGestorStrict()) return toast('Somente o GESTOR pode corrigir a forma de um recebimento.', 'err');
    if (!canCorrectMethod(p)) return toast('Este lançamento não pode ter a forma corrigida.', 'err');
    openCorrectMethodModal(p);
  };

  window.vxFinOpenDrawer = async function (paymentId) {
    const p = ui.rows.find((x) => x.id === paymentId);
    if (!p) return;
    closeDrawer();
    closeAllMenus();
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO (sem OS)';
    const situacao = situacaoOf(p);
    const remaining = remainingFor(p);
    const reversibleHere = canReverseRow(p);
    const canReverse = reversibleHere && ui.canReverse;
    const canCorrect = isGestorStrict() && canCorrectMethod(p);
    // Estorno(s) já aplicados a ESTE lançamento (se for o original) --
    // pra "Detalhes do estorno" (quem estornou, quando, motivo) sem
    // precisar abrir a transação de estorno separadamente.
    const reversalsOfThis = p.reversal_state
      ? ui.rows.filter((x) => x.reversal_of_payment_id === p.id).sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at))
      : [];

    const bg = document.createElement('div');
    bg.id = 'vxFinDrawer';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-drawer">
      <h3>${situacao === 'ESTORNADO' ? 'ESTORNADO — ' : ''}DETALHE DO LANÇAMENTO</h3>
      <div class="vx-fin-drawer-grid">
        <div><span>OS</span><b>${os ? esc(os) : 'SEM OS (AVULSO)'}</b></div>
        <div><span>CLIENTE</span><b>${esc(cliente)}</b></div>
        <div><span>VALOR ORIGINAL</span><b class="${Number(p.amount) < 0 ? 'vx-fin-reversal-tag' : ''}">${money(p.amount)}</b></div>
        <div><span>FORMA</span><b>${methodLabel(p)}</b></div>
        <div><span>RECEBIDO EM</span><b>${dtFull(p.paid_at)}</b></div>
        <div><span>RECEBIDO POR</span><b>${esc(p.profiles?.full_name || '—')}</b></div>
        <div><span>EMPRESA</span><b>${esc(ui.companyName)}</b></div>
        <div><span>OPERATION ID</span><b class="vx-fin-mono">${esc(p.operation_id || '—')}</b></div>
        <div><span>SITUAÇÃO</span><b>${SITUACAO_LABEL[situacao]}${p.reversal_state === 'PARCIAL' ? ` (restam ${money(remaining)} p/ estornar)` : ''}</b></div>
        <div><span>VALOR DA OS</span><b id="vxFinDrawerBudget">carregando…</b></div>
        <div><span>SALDO RESULTANTE</span><b id="vxFinDrawerSaldo">carregando…</b></div>
      </div>
      <div><span class="vx-fin-drawer-label">OBSERVAÇÃO</span><p class="vx-fin-drawer-notes">${esc(p.notes || '—')}</p></div>
      ${p.reversal_of_payment_id ? `<div class="vx-fin-drawer-note-box">Este lançamento é o ESTORNO de outra transação (id ${esc(p.reversal_of_payment_id)}).</div>` : ''}
      ${reversalsOfThis.length ? `<div class="vx-fin-drawer-reversals"><h4>ESTORNO${reversalsOfThis.length > 1 ? 'S' : ''} DESTE LANÇAMENTO</h4>${reversalsOfThis.map((r) => `
        <div class="vx-fin-reversal-item">
          <div><span>VALOR ESTORNADO</span><b class="vx-fin-reversal-tag">${money(Math.abs(r.amount))}</b></div>
          <div><span>ESTORNADO POR</span><b>${esc(r.profiles?.full_name || '—')}</b></div>
          <div><span>ESTORNADO EM</span><b>${dtFull(r.paid_at)}</b></div>
          <div><span>MOTIVO / OBSERVAÇÃO</span><b>${esc(r.notes || '—')}</b></div>
        </div>`).join('')}</div>` : ''}
      ${isGestorStrict() && p.correction_of_payment_id ? `<div class="vx-fin-correction-history">
        <button type="button" class="vx-fin-collapsible-toggle" id="vxFinCorrHistToggle">▸ Histórico de correções</button>
        <div id="vxFinCorrHistBody" hidden></div>
      </div>` : ''}
      <div id="vxFinDrawerAudit" class="vx-fin-drawer-audit"></div>
      <div class="vx-modal-actions" style="justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${os ? `<button type="button" id="vxFinDrawerOpenOs">ABRIR OS</button>` : ''}
          <button type="button" id="vxFinDrawerReceipt">COMPROVANTE</button>
          <button type="button" id="vxFinDrawerAuditBtn">AUDITORIA</button>
          ${canReverse ? `<button type="button" class="vx-orange-btn" id="vxFinDrawerReverse">ESTORNAR RECEBIMENTO</button>`
            : (reversibleHere && !ui.canReverse ? `<span class="vx-fin-reverse-locked" title="Requer a permissão financeiro.reverse">Estornar recebimento indisponível — requer a permissão <b>financeiro.reverse</b></span>` : '')}
          ${canCorrect ? `<button type="button" id="vxFinDrawerCorrect">CORRIGIR FORMA DE PAGAMENTO</button>` : ''}
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
    if (canCorrect) bg.querySelector('#vxFinDrawerCorrect').onclick = () => openCorrectMethodModal(p);
    const corrHistToggle = bg.querySelector('#vxFinCorrHistToggle');
    if (corrHistToggle) {
      corrHistToggle.onclick = async () => {
        const body = bg.querySelector('#vxFinCorrHistBody');
        const willOpen = body.hidden;
        if (willOpen && !body.dataset.loaded) {
          body.innerHTML = 'Carregando…';
          const chain = await loadCorrectionHistory(p);
          body.dataset.loaded = '1';
          body.innerHTML = chain.length ? chain.map((c) => `
            <div class="vx-fin-correction-item">
              <div><span>FORMA ANTERIOR</span><b>${esc(c.from)}</b></div>
              <div><span>FORMA CORRIGIDA</span><b>${esc(c.to)}</b></div>
              <div><span>VALOR</span><b>${money(c.amount)}</b></div>
              <div><span>MOTIVO</span><b>${esc(c.reason || '—')}</b></div>
              <div><span>GESTOR RESPONSÁVEL</span><b>${esc(c.gestor)}</b></div>
              <div><span>DATA/HORA</span><b>${dtFull(c.at)}</b></div>
            </div>`).join('') : '<p class="vx-empty">Nenhuma correção encontrada.</p>';
        }
        body.hidden = !willOpen;
        corrHistToggle.textContent = `${willOpen ? '▾' : '▸'} Histórico de correções`;
      };
    }

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
  // Motivos fixos pedidos pelo usuário (2026-09-13, "Implementar estorno
  // de recebimentos") -- concatenados com a observação livre num único
  // texto (reverse_payment só tem UM parâmetro p_reason; reaproveitar
  // esse contrato existente em vez de mudar a RPC pra separar os dois
  // campos no banco).
  const REVERSAL_REASONS = ['Lançamento duplicado', 'Forma de pagamento incorreta', 'Valor incorreto', 'Pagamento não realizado/confirmado', 'Outro'];

  function openReverseModal(p, remaining) {
    document.querySelector('#vxFinReverseModal')?.remove();
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO';
    const bg = document.createElement('div');
    bg.id = 'vxFinReverseModal';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-avulso-modal vx-fin-reverse-modal">
      <h3>Estornar recebimento</h3>
      <div class="vx-fin-reverse-summary">
        <div><span>OS</span><b>${os ? esc(os) : 'SEM OS (AVULSO)'}</b></div>
        <div><span>Cliente</span><b>${esc(cliente)}</b></div>
        <div><span>Valor</span><b>${money(p.amount)}</b></div>
        <div><span>Forma</span><b>${esc(p.method)}</b></div>
        <div><span>Data/hora</span><b>${dtFull(p.paid_at)}</b></div>
      </div>
      <div class="vx-field"><label>VALOR A ESTORNAR (R$) — disponível: ${money(remaining)}</label><input class="vx-control" type="number" step=".01" min="0.01" max="${remaining}" id="vxFinRevAmount" value="${remaining.toFixed(2)}"></div>
      <div class="vx-field"><label>MOTIVO *</label><select class="vx-control" id="vxFinRevReasonSelect"><option value="">Selecione...</option>${REVERSAL_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
      <div class="vx-field"><label>OBSERVAÇÃO COMPLEMENTAR</label><textarea class="vx-control" id="vxFinRevNotes" rows="2" placeholder="Opcional"></textarea></div>
      <p class="vx-fin-reverse-warning">Este recebimento deixará de compor os valores financeiros (totais, saldo da OS e relatórios). O lançamento original é preservado no histórico, marcado como estornado.</p>
      <div class="vx-modal-actions"><button type="button" data-close>Cancelar</button><button type="button" class="vx-orange-btn" id="vxFinRevConfirm">Confirmar estorno</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-close]').onclick = close;
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    const confirmBtn = bg.querySelector('#vxFinRevConfirm');
    confirmBtn.onclick = async () => {
      // Trava de duplo-clique: o backend (lock FOR UPDATE + soma dos
      // estornos já ligados) já impede um estorno acima do disponível
      // mesmo que duas chamadas cheguem quase juntas -- mas desabilitar
      // aqui evita a segunda chamada de rede inútil/confusa.
      if (confirmBtn.disabled) return;
      const amount = Number(String($('#vxFinRevAmount', bg).value || '0').replace(',', '.'));
      const reasonPick = $('#vxFinRevReasonSelect', bg).value;
      const notes = ($('#vxFinRevNotes', bg).value || '').trim();
      if (!(amount > 0)) return toast('Informe um valor maior que zero.', 'err');
      if (amount > remaining + 0.004) return toast(`Valor não pode ultrapassar o disponível (${money(remaining)}).`, 'err');
      if (!reasonPick) return toast('Selecione o motivo do estorno.', 'err');
      const fullReason = notes ? `${reasonPick} — ${notes}` : reasonPick;
      if (!confirm(`Confirmar estorno de ${money(amount)}? O recebimento deixará de compor os valores financeiros.`)) return;
      confirmBtn.disabled = true;
      try {
        await api('rpc/reverse_payment', { method: 'POST', body: JSON.stringify({ p_payment_id: p.id, p_reason: fullReason, p_amount: amount }) });
        toast('Estorno registrado.');
        close();
        closeDrawer();
        await reload();
      } catch (e) { toast('Erro ao estornar: ' + e.message, 'err'); confirmBtn.disabled = false; }
    };
  }

  // ---- Corrigir forma de pagamento (GESTOR estrito, migration
  // 20260914050000) ----
  // Por baixo dos panos é estorno interno + novo recebimento
  // (correct_payment_method), mas o usuário nunca precisa saber disso
  // pra usar a tela -- só o resumo explica, e o resultado sempre
  // aparece como UM pagamento só (com "*") em qualquer relatório.
  function openCorrectMethodModal(p) {
    document.querySelector('#vxFinCorrectModal')?.remove();
    const os = p.service_orders?.os_number;
    const cliente = p.service_orders ? (p.service_orders.clients?.name || '—') : 'BALCÃO';
    const otherMethods = ui.methods.filter((m) => up(m.name) !== 'DESCONTO' && up(m.name) !== up(p.method));
    const bg = document.createElement('div');
    bg.id = 'vxFinCorrectModal';
    bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal vx-fin-avulso-modal vx-fin-correct-modal">
      <h3>Corrigir forma de pagamento</h3>
      <div class="vx-fin-reverse-summary">
        <div><span>OS</span><b>${os ? esc(os) : 'SEM OS (AVULSO)'}</b></div>
        <div><span>Cliente</span><b>${esc(cliente)}</b></div>
        <div><span>Valor a corrigir</span><b>${money(p.amount)}</b></div>
        <div><span>Forma registrada atualmente</span><b>${esc(p.method)}</b></div>
      </div>
      <div class="vx-field"><label>NOVA FORMA DE PAGAMENTO *</label><select class="vx-control" id="vxFinCorrMethod"><option value="">Selecione...</option>${otherMethods.map((m) => `<option>${esc(m.name)}</option>`).join('')}</select></div>
      <div class="vx-field"><label>MOTIVO DA CORREÇÃO *</label><textarea class="vx-control" id="vxFinCorrReason" rows="2" placeholder="Ex.: Cliente informou que pagou via PIX, não em dinheiro"></textarea></div>
      <p class="vx-fin-reverse-warning">O lançamento atual será estornado e um novo recebimento será criado com a forma corrigida. Mesma OS, empresa e valor -- o recebimento continuará aparecendo como um único pagamento (com um * ao lado da forma) no Financeiro, Caixa, relatório diário e financeiro da OS.</p>
      <div class="vx-modal-actions"><button type="button" data-close>Cancelar</button><button type="button" class="vx-green-btn" id="vxFinCorrConfirm">Confirmar correção</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-close]').onclick = close;
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    // Mesma chave de idempotência por abertura do modal -- ver
    // vxOpenRegisterPayment/openAvulsoModal -- clique duplo/retry de
    // rede na mesma chave devolve o mesmo resultado (correct_payment_method
    // é idempotente via payment_corrections), nunca duplica.
    const idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    const confirmBtn = bg.querySelector('#vxFinCorrConfirm');
    confirmBtn.onclick = async () => {
      if (confirmBtn.disabled) return;
      const newMethod = $('#vxFinCorrMethod', bg).value;
      const reason = ($('#vxFinCorrReason', bg).value || '').trim();
      if (!newMethod) return toast('Selecione a nova forma de pagamento.', 'err');
      if (up(newMethod) === up(p.method)) return toast('A nova forma precisa ser diferente da forma atual.', 'err');
      if (!reason) return toast('Informe o motivo da correção.', 'err');
      if (!confirm(`Confirmar correção: ${esc(p.method)} → ${esc(newMethod)} (${money(p.amount)})?`)) return;
      confirmBtn.disabled = true;
      try {
        await api('rpc/correct_payment_method', {
          method: 'POST',
          body: JSON.stringify({ p_payment_id: p.id, p_new_method: newMethod, p_reason: reason, p_idempotency_key: idempotencyKey }),
        });
        toast('Forma de pagamento corrigida.');
        close();
        closeDrawer();
        await reload();
      } catch (e) { toast('Erro ao corrigir forma de pagamento: ' + e.message, 'err'); confirmBtn.disabled = false; }
    };
  }

  // Fecha qualquer menu ⋮ aberto ao clicar fora dele -- os próprios
  // botões do menu chamam vxFinToggleMenu/vxFinQuickReverse a partir de
  // uma célula com stopPropagation, então esse clique nunca chega aqui
  // pra se fechar sozinho antes de agir.
  document.addEventListener('click', closeAllMenus);

  window.renderFinance = async function () {
    if (typeof can === 'function' && !can('financeiro')) {
      $('#app').innerHTML = `<div class="card error-card"><h3>Acesso restrito</h3><p>Seu perfil não tem acesso ao Financeiro.</p></div>`;
      return;
    }
    [ui.methods, ui.companyName, ui.users, ui.canReverse] = await Promise.all([loadPaymentMethods(), loadCompanyName(), loadUsers(), userCanReverse()]);
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
      <div class="vx-fin-filters vx-fin-filters-selects">
        <select class="vx-control" id="vxFinFilterUser"><option value="">Usuário (todos)</option>${ui.users.map((u) => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select>
        <select class="vx-control" id="vxFinFilterMethod"><option value="">Forma (todas)</option>${ui.methods.filter((m) => up(m.name) !== 'DESCONTO').map((m) => `<option>${esc(m.name)}</option>`).join('')}</select>
        <select class="vx-control" id="vxFinFilterSituacao"><option value="">Situação (todas)</option><option value="RECEBIDO">Recebido</option><option value="PARCIAL_ESTORNADO">Parcial estornado</option><option value="ESTORNADO">Estornado</option><option value="ESTORNO">Estorno (lançamento)</option></select>
        <select class="vx-control" id="vxFinSortBy" title="Organiza os lançamentos dentro de cada dia">
          <option value="horario" ${ui.sortBy === 'horario' ? 'selected' : ''}>Ordem: Horário</option>
          <option value="forma" ${ui.sortBy === 'forma' ? 'selected' : ''}>Ordem: Forma de pagamento</option>
          <option value="os" ${ui.sortBy === 'os' ? 'selected' : ''}>Ordem: OS</option>
        </select>
      </div>
      <div class="vx-fin-table-wrap"><table class="vx-fin-table"><thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Usuário</th><th>Situação</th><th></th></tr></thead><tbody id="vxFinRows"></tbody></table></div>
      <div class="vx-fin-totals-box"><h3>RECEBIMENTOS DO PERÍODO</h3><div id="vxFinTotals"></div></div>
    </div>`;

    $$('.vx-fin-chips [data-range]').forEach((b) => b.onclick = () => {
      ui.range = b.dataset.range;
      saveLastRange(ui.range);
      $$('.vx-fin-chips [data-range]').forEach((x) => x.classList.toggle('active', x === b));
      $('#vxFinPeriodBox').classList.toggle('hidden', ui.range !== 'periodo');
      if (ui.range !== 'periodo') reload();
    });
    $('#vxFinApplyPeriod').onclick = () => { ui.from = $('#vxFinFrom').value; ui.to = $('#vxFinTo').value; saveLastRange('periodo'); reload(); };
    $('#vxFinSearch').oninput = (e) => { ui.q = e.target.value; repaint(); };
    $('#vxFinFilterUser').onchange = (e) => { ui.userId = e.target.value; repaint(); };
    $('#vxFinFilterMethod').onchange = (e) => { ui.method = e.target.value; repaint(); };
    $('#vxFinFilterSituacao').onchange = (e) => { ui.situacao = e.target.value; repaint(); };
    $('#vxFinSortBy').onchange = (e) => { ui.sortBy = e.target.value; repaint(); };
    $('#vxFinNewAvulso').onclick = openAvulsoModal;

    await reload();
  };
})();
