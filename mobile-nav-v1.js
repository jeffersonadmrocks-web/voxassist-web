/* VoxAssist Web — PWA-1: navegação inferior mobile (Hoje | Agenda | OS |
   Chat | Mais).

   Não cria uma segunda navegação paralela: cada item chama exatamente o
   mesmo window.render(view)/renderSystem3Legacy() que o sidebar desktop já
   usa -- só uma apresentação diferente da mesma aplicação (mesmas rotas,
   mesmos dados, mesmo `can()`).

   Segurança: `can(area)` (app.js) hoje só é checado no wiring do onclick
   do botão desktop, nunca dentro do próprio render() -- então qualquer
   caminho novo que chame render(view) direto precisa repetir esse mesmo
   gate, senão um TECNICO abriria financeiro/usuarios só de tocar no item
   errado no menu mobile. Todo item aqui (barra e "Mais") passa por
   can(view) antes de navegar; o atalho de Chat usa window.vxCanUseChat()
   (chat-beta-v0828.js), a mesma regra do menu desktop (GESTOR/ATENDENTE).

   `shell()` substitui document.body.innerHTML por completo e roda mais de
   uma vez por sessão (troca de loja, salvar perfil, primeiro acesso --
   ver company-management-final-v0813.js, homologation-patch.js) -- por
   isso a barra precisa ser remontada a cada shell(), exatamente como
   sidebar-special-v0812.js e pulse-ia-link-v0825.js já fazem para o
   próprio conteúdo deles. Não adiciona wrapper de window.render nem
   MutationObserver global -- só window.shell, seguindo o mesmo padrão já
   estabelecido para esse problema específico. */
(function () {
  const previousShell = window.shell;

  const PRIMARY_TABS = [
    { view: 'dashboard', label: 'HOJE', icon: '⌂' },
    { view: 'agenda', label: 'AGENDA', icon: '☑' },
    { view: 'os', label: 'OS', icon: '▣' },
    { view: 'chat', label: 'CHAT', icon: '◆', requires: () => typeof window.vxCanUseChat === 'function' && window.vxCanUseChat() },
  ];

  const MAIS_ITEMS = [
    { view: 'oficina', label: 'OFICINA', icon: '⚒' },
    { view: 'financeiro', label: 'FINANCEIRO', icon: '$' },
    { view: 'estoque', label: 'LOJA VIRTUAL', icon: '▤' },
    { view: 'testes', label: 'RELATÓRIOS', icon: '▥' },
    { view: 'electrolux', label: 'ELECTROLUX', icon: '▥' },
    { view: 'usuarios', label: 'CONFIGURAÇÕES', icon: '⚙' },
  ];

  function activeTabView() {
    const v = String((typeof state !== 'undefined' && state.view) || '');
    if (v.startsWith('os:')) return 'os';
    return v;
  }

  function highlight(nav) {
    const active = activeTabView();
    nav.querySelectorAll('[data-view]').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === active);
    });
  }

  function goTo(view) {
    if (!can(view)) {
      toast('Seu perfil não tem acesso a este módulo.', 'err');
      return;
    }
    window.render(view);
  }

  // Mesmo padrão de pulse-ia-link-v0825.js: abre a aba a partir do gesto
  // do usuário (antes do fetch) pra não ser bloqueada como popup, manda só
  // o slug pro App Gateway e navega a aba já aberta com a URL validada
  // que ele devolver. Duplicado aqui (em vez de importar daquele arquivo)
  // pra não mexer num fluxo já existente e sensível só por causa do menu
  // mobile -- mesma lógica, sem alterar o arquivo original.
  async function openPulseIA() {
    const popup = window.open('about:blank', '_blank');
    if (!popup) { toast('O navegador bloqueou a nova aba do Pulse IA. Libere pop-ups para o VoxAssist.', 'err'); return; }
    try { popup.opener = null; } catch (_) {}
    try {
      const res = await fetch(CFG.url + '/functions/v1/app-gateway-launch', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'pulse-ia', origin: 'mobile-nav' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'launch_failed');
      popup.location.replace(data.url);
    } catch (e) {
      try { popup.close(); } catch (_) {}
      toast('Não foi possível abrir o Pulse IA no momento.', 'err');
    }
  }

  function closeMais() {
    document.querySelector('#vxMaisSheet')?.remove();
  }

  function openMais() {
    closeMais();
    const items = MAIS_ITEMS.filter((it) => can(it.view));
    const overlay = document.createElement('div');
    overlay.id = 'vxMaisSheet';
    overlay.innerHTML = `
      <div class="vx-mais-backdrop" data-explicit-nav="1"></div>
      <div class="vx-mais-panel" role="dialog" aria-modal="true" aria-label="Mais opções">
        <div class="vx-mais-head"><strong>MAIS</strong><button class="vx-mais-close" data-explicit-nav="1" aria-label="Fechar">×</button></div>
        <div class="vx-mais-grid">
          ${items.map((it) => `<button class="vx-mais-item" data-explicit-nav="1" data-mais-view="${it.view}"><span class="vx-mais-ic">${it.icon}</span><span>${it.label}</span></button>`).join('')}
          <button class="vx-mais-item" data-explicit-nav="1" data-mais-action="pulse-ia"><span class="vx-mais-ic">P</span><span>PULSE IA</span></button>
          <button class="vx-mais-item" data-explicit-nav="1" data-mais-action="system3"><span class="vx-mais-ic">◷</span><span>LEGADO SYSTEM3</span></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.vx-mais-backdrop').onclick = closeMais;
    overlay.querySelector('.vx-mais-close').onclick = closeMais;
    overlay.querySelectorAll('[data-mais-view]').forEach((b) => {
      b.onclick = () => { closeMais(); goTo(b.dataset.maisView); };
    });
    overlay.querySelector('[data-mais-action="pulse-ia"]').onclick = () => { closeMais(); openPulseIA(); };
    overlay.querySelector('[data-mais-action="system3"]').onclick = () => { closeMais(); window.renderSystem3Legacy?.(); };
  }

  function ensureMobileNav() {
    document.querySelector('#vxMobileNav')?.remove();
    const tabs = PRIMARY_TABS.filter((t) => !t.requires || t.requires());
    const nav = document.createElement('nav');
    nav.id = 'vxMobileNav';
    nav.innerHTML = tabs.map((t) => `<button class="vx-mnav-item" data-explicit-nav="1" data-view="${t.view}"><span class="vx-mnav-ic">${t.icon}</span><span class="vx-mnav-lb">${t.label}</span></button>`).join('')
      + `<button class="vx-mnav-item" id="vxMnavMais" data-explicit-nav="1"><span class="vx-mnav-ic">☰</span><span class="vx-mnav-lb">MAIS</span></button>`;
    document.body.appendChild(nav);
    nav.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { goTo(b.dataset.view); highlight(nav); }; });
    nav.querySelector('#vxMnavMais').onclick = openMais;
    highlight(nav);
  }

  window.shell = function () {
    const out = previousShell.apply(this, arguments);
    ensureMobileNav();
    return out;
  };

  const style = document.createElement('style');
  style.textContent = `
    #vxMobileNav{display:none}
    @media(max-width:800px){
      .desktop-sidebar{display:none!important}
      .desktop-footer{display:none!important}
      .desktop-main{padding-bottom:76px!important}
      #vxMobileNav{
        display:flex;position:fixed;left:0;right:0;bottom:0;z-index:9998;
        background:#0c2340;border-top:1px solid #1c3d63;
        padding:6px 2px calc(6px + env(safe-area-inset-bottom));
        box-shadow:0 -4px 14px rgba(0,0,0,.18);
      }
      .vx-mnav-item{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:0;color:#9fb8d4;padding:6px 2px;font-size:9px;font-weight:700;letter-spacing:.3px;cursor:pointer}
      .vx-mnav-ic{font-size:18px;line-height:1}
      .vx-mnav-lb{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .vx-mnav-item.active{color:#70b7ff}
    }
    #vxMaisSheet{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end}
    .vx-mais-backdrop{position:absolute;inset:0;background:rgba(6,20,38,.5)}
    .vx-mais-panel{position:relative;width:100%;max-height:72vh;overflow:auto;background:#fff;border-radius:16px 16px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.25)}
    .vx-mais-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#0c2340}
    .vx-mais-close{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#0c2340}
    .vx-mais-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .vx-mais-item{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;border:1px solid #e1e7ee;border-radius:12px;background:#f7f9fb;color:#0c2340;font-size:10px;font-weight:700;letter-spacing:.2px;cursor:pointer}
    .vx-mais-ic{font-size:20px}
    @media(min-width:801px){#vxMaisSheet{display:none!important}}
  `;
  document.head.appendChild(style);
})();
