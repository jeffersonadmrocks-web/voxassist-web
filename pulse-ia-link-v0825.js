/* VoxAssist Web V0.8.13 — atalho pro Pulse IA (app externo, GitHub/Supabase/deploy
   próprios) logo acima do card de Loja Virtual, mesmo padrão visual do bloco especial.
   O clique passa pelo App Gateway (edge function app-gateway-launch): o front nunca
   guarda/decide a URL de destino, só manda o slug 'pulse-ia' e abre o que o backend
   validado devolver. Abre em nova aba do navegador — sem iframe, sem SSO, sem
   sessão/cookies compartilhados com o VoxAssist. Nenhum dado do Pulse IA (token,
   chave, segredo) existe neste arquivo. */
(function(){
  const previousShell = window.shell;

  async function launchApp(slug){
    const res = await fetch(CFG.url + '/functions/v1/app-gateway-launch', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, origin: 'sidebar' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'launch_failed');
    return data;
  }

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
        <svg viewBox="0 0 64 64" role="img" aria-label="Pulse IA">
          <defs>
            <mask id="pulse-ia-p-mask">
              <rect width="64" height="64" fill="#000"/>
              <path d="M10 59V5h27c15 0 24 8.2 24 21.5S52 48 37 48H26v11H10Z" fill="#fff"/>
              <path d="M27 15.5h11c7.7 0 12.5 4.2 12.5 10.8S45.7 37 38 37h-5.2l-7.3 5.1 2.2-6.7c-3.9-1.9-6.2-5-6.2-9.1 0-6.6 2.5-10.8 5.5-10.8Z" fill="#000"/>
            </mask>
          </defs>
          <rect width="64" height="64" fill="currentColor" mask="url(#pulse-ia-p-mask)"/>
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M36 22.5 29.5 31M36 22.5 43 31M29.5 31H43" stroke-width="1.25"/>
            <circle cx="36" cy="21" r="4.15" stroke-width="1.2"/>
            <circle cx="29" cy="32" r="4.15" stroke-width="1.2"/>
            <circle cx="43.5" cy="32" r="4.15" stroke-width="1.2"/>
            <path d="M34.3 18.8c-.5.7-.4 2 .4 3.1.8 1.1 2 1.7 2.8 1.4l.8-.9-1.5-1-.6.5c-.5-.2-1.1-.8-1.3-1.3l.4-.6-1-1.4-.0.2Z" stroke-width=".9"/>
            <rect x="26.9" y="29.9" width="4.2" height="4.2" rx="1.15" stroke-width=".95"/>
            <circle cx="29" cy="32" r=".85" stroke-width=".8"/>
            <circle cx="30.4" cy="30.7" r=".22" fill="currentColor" stroke="none"/>
            <path d="M44.4 35v-3h1.05l.18-1.2h-1.23v-.65c0-.35.18-.6.65-.6h.7v-1.05c-.3-.05-.65-.1-1.05-.1-1.05 0-1.7.65-1.7 1.8v.6h-.95V32h.95v3" stroke-width="1.05"/>
          </g>
        </svg>
      </span>
      <span class="pulse-ia-copy"><strong>PULSE IA</strong><small>Redes sociais com apoio de IA</small></span>`;
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const data = await launchApp('pulse-ia');
        window.open(data.url, '_blank', 'noopener');
      } catch (e) {
        toast?.('Não foi possível abrir o Pulse IA no momento.', 'err');
      } finally {
        btn.disabled = false;
      }
    };

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
