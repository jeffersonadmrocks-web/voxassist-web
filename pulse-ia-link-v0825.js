/* VoxAssist Web V0.8.13 — atalho pro Pulse IA (app externo, GitHub/Supabase/deploy
   próprios) logo acima do card de Loja Virtual, mesmo padrão visual do bloco especial.
   Abre em nova aba do navegador — sem iframe, sem SSO, sem sessão/cookies compartilhados
   com o VoxAssist. Nenhum dado do Pulse IA (token, chave, segredo) existe neste arquivo,
   só a URL pública do app. */
(function(){
  const PULSE_IA_URL = 'https://pulse-ia-eight.vercel.app';
  const previousShell = window.shell;

  function ensurePulseCard(){
    const sidebar = document.querySelector('.desktop-sidebar');
    // O bloco especial é criado pelo sidebar-special-v0812.js (Loja Virtual);
    // este script só entra depois pra inserir o card do Pulse IA acima dele.
    const special = sidebar?.querySelector('.desktop-special-menu');
    if(!sidebar || !special) return;
    if(special.querySelector('.pulse-ia-card')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pulse-ia-card';
    btn.setAttribute('aria-label', 'Abrir Pulse IA em nova aba');
    btn.innerHTML = `
      <span class="pulse-ia-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img">
          <path d="M6 34h9l5-15 8 27 6-21 4 9h20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="50" cy="17" r="4" fill="currentColor"/>
          <circle cx="59" cy="30" r="3" fill="currentColor"/>
          <circle cx="50" cy="43" r="3" fill="currentColor"/>
          <path d="M50 17l9 13M59 30l-9 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="pulse-ia-copy"><strong>PULSE IA</strong><small>Redes sociais com apoio de IA</small></span>`;
    btn.onclick = () => window.open(PULSE_IA_URL, '_blank', 'noopener');

    const storeCard = special.querySelector('.virtual-store-card');
    special.insertBefore(btn, storeCard || special.firstChild);
  }

  window.shell = function(){
    const out = previousShell.apply(this, arguments);
    ensurePulseCard();
    return out;
  };

  const style = document.createElement('style');
  style.textContent = `
    .pulse-ia-card{width:100%;min-height:92px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:linear-gradient(145deg,#7c3aed,#4c1d95);color:#fff;padding:12px 10px;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.16);transition:transform .15s ease,filter .15s ease,box-shadow .15s ease}
    .pulse-ia-card:hover{transform:translateY(-1px);filter:brightness(1.06);box-shadow:0 10px 22px rgba(0,0,0,.2)}
    .pulse-ia-icon{width:52px;height:52px;flex:0 0 52px;border-radius:12px;background:rgba(255,255,255,.16);display:grid;place-items:center}
    .pulse-ia-icon svg{width:43px;height:43px}
    .pulse-ia-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
    .pulse-ia-copy strong{font-size:13px;letter-spacing:.2px}
    .pulse-ia-copy small{font-size:9px;line-height:1.25;color:#ede9fe}
    @media(max-height:720px){.pulse-ia-card{min-height:76px}.pulse-ia-icon{width:42px;height:42px;flex-basis:42px}.pulse-ia-icon svg{width:35px;height:35px}}
  `;
  document.head.appendChild(style);
})();
