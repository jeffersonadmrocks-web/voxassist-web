/* VoxAssist Web — PWA-1: integra o botão/gesto de voltar do Android (e o
   "Voltar" do navegador em geral) ao histórico real de telas do app.

   Achado do usuário: instalado como PWA, o botão de voltar do Android
   saía do app inteiro em vez de voltar pra tela anterior (como qualquer
   outro app). Causa: o app nunca chamava history.pushState -- toda a
   navegação (render(view)) só troca state.view/o conteúdo de #app em
   memória, então a pilha de histórico do navegador tinha uma ÚNICA
   entrada (o carregamento inicial) a sessão inteira. Voltar com uma
   pilha de 1 entrada, num PWA em modo standalone, fecha o app.

   Corrigido empurrando uma entrada de histórico (mesma URL, só o estado
   muda) a cada troca de tela real, e reagindo a popstate chamando de
   volta o mesmo window.render(view) -- não duplica lógica de navegação,
   só observa o resultado final. Lê state.view DEPOIS de chamar o render
   (não o argumento recebido) porque navigation-policy-v0812.js pode
   redirecionar a chamada original (ex.: render('dashboard') vira
   render('os:123') se o usuário estava dentro de uma OS) -- state.view
   é o único lugar que reflete o que realmente foi renderizado.

   PWA-1 (2026-09-13) -- achado do usuário: com o histórico de telas já
   funcionando, voltar enquanto um pop-up/modal está aberto (ex.: um
   drill-down do Dashboard) NÃO fechava o modal -- caía direto na lógica
   de navegação de telas acima e, se já não havia telas anteriores na
   pilha, saía do app inteiro. Nenhum modal do app usa <dialog>/roteamento
   próprio: são só um <div> "overlay" (.vx-modal-bg, .vx-c-modal-bg,
   .vx-notes-overlay, .vx-admin-overlay, .vx-company-confirm-overlay,
   entre outras classes -- 15+ arquivos, cada um com seu próprio nome de
   classe) inserido direto em document.body e removido inteiramente
   (bg.remove()) ao fechar (clique no X, no fundo, Salvar, Cancelar...).
   Em vez de listar cada classe (frágil -- qualquer modal novo ficaria de
   fora), detecta QUALQUER <div> desses genericamente pelo estilo
   computado que todos compartilham: position:fixed + as 4 bordas em 0
   (equivalente a `inset:0`), o que nenhum outro elemento fixo do app usa
   (o toast só fixa right/bottom; a barra #vxMobileNav só fixa left/
   right/bottom, sem top). Cada abertura empurra uma entrada extra de
   histórico; voltar com um modal aberto fecha só ele (sem navegar);
   fechar o modal pela própria UI consome sozinho essa entrada extra
   (history.back() silencioso) pra não deixar "lixo" na pilha. */
(function () {
  const previousRender = window.render;
  if (typeof previousRender !== 'function') return;

  let lastPushedView = null;
  let suppressPush = false;

  function currentView() {
    return String((typeof state !== 'undefined' && state.view) || '');
  }

  window.render = async function (view) {
    const r = await previousRender(view);
    const actual = currentView();
    if (!suppressPush && actual && actual !== lastPushedView) {
      history.pushState({ vxView: actual }, '', location.href);
      lastPushedView = actual;
    }
    return r;
  };

  // ---- PWA-1: pilha de modais/pop-ups full-screen (ver comentário acima) ----
  const openModals = []; // elementos <div> overlay atualmente na pilha
  let expectingOwnRemoval = false; // true enquanto fechamos um modal nós mesmos (via voltar)
  let consumingStaleEntry = false; // true enquanto consumimos a entrada de histórico de um modal fechado pela própria UI

  function isFullScreenOverlay(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.id === 'vxMobileNav') return false;
    const cs = getComputedStyle(node);
    return cs.position === 'fixed' && cs.top === '0px' && cs.right === '0px' && cs.bottom === '0px' && cs.left === '0px';
  }

  function closeTopModal() {
    const el = openModals.pop();
    if (!el) return false;
    expectingOwnRemoval = true;
    el.remove();
    return true;
  }

  const modalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes && m.addedNodes.forEach((node) => {
        if (isFullScreenOverlay(node) && openModals.indexOf(node) === -1) {
          openModals.push(node);
          history.pushState({ vxModal: true }, '', location.href);
        }
      });
      m.removedNodes && m.removedNodes.forEach((node) => {
        const idx = openModals.indexOf(node);
        if (idx === -1) return;
        openModals.splice(idx, 1);
        if (expectingOwnRemoval) {
          // Já foi o próprio handler de voltar que removeu -- a entrada de
          // histórico correspondente já foi consumida pelo popstate atual.
          expectingOwnRemoval = false;
        } else {
          // Fechado pela própria UI do modal (X/fundo/Salvar/Cancelar) --
          // sobrou uma entrada de histórico "fantasma" pra esse modal;
          // consome sozinha, sem deixar o usuário precisar apertar voltar
          // uma vez a mais só pra "descartar" um modal que já nem existe.
          consumingStaleEntry = true;
          history.back();
        }
      });
    }
  });
  if (typeof document !== 'undefined' && document.body) {
    modalObserver.observe(document.body, { childList: true });
  }

  window.addEventListener('popstate', (e) => {
    if (consumingStaleEntry) {
      consumingStaleEntry = false;
      return;
    }
    if (closeTopModal()) return;
    const v = e.state && e.state.vxView;
    // Sem estado nessa entrada (ex.: a entrada original, pré-login) ou
    // usuário ainda não autenticado -- deixa o comportamento nativo
    // acontecer (sair do app), exatamente como em qualquer outro app
    // quando a pilha de telas internas se esgota.
    if (!v || typeof state === 'undefined' || !state.session) return;
    suppressPush = true;
    lastPushedView = v;
    Promise.resolve(window.render(v)).finally(() => { suppressPush = false; });
  });

  // Semeia a entrada de histórico atual com o view corrente (state.view já
  // nasce com 'dashboard' antes mesmo do primeiro render) -- sem isso, o
  // primeiro "voltar" cairia numa entrada sem vxView.
  history.replaceState({ vxView: currentView() }, '', location.href);
  lastPushedView = currentView();
})();
