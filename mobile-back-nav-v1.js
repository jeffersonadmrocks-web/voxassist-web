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
   é o único lugar que reflete o que realmente foi renderizado. */
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

  window.addEventListener('popstate', (e) => {
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
