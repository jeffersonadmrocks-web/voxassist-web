/* VoxAssist Web V0.9.07 — aviso de versão desatualizada.
   Achado do usuário em 2026-09-07: este app é um SPA de vários
   scripts sem reload de página nas trocas de aba/tela (render() só
   troca #app.innerHTML) -- uma aba do navegador aberta ANTES de um
   deploy nunca vê o código novo, mesmo navegando normalmente dentro
   do sistema por horas depois. Isso já foi confundido mais de uma vez
   com "retrocesso"/bug real (ex.: cards de Configurações e botão
   Voltar "sumindo" numa aba antiga, enquanto uma aba nova mostrava
   tudo certo). Poll periódico comparando o <meta name="vx-build">
   desta página com o do index.html atual no servidor -- se divergir,
   banner fixo, visível, nunca reload automático (perderia trabalho
   não salvo, ex.: uma OS em edição).
   IMPORTANTE pra quem mexer no código depois: bump o content de
   <meta name="vx-build"> no index.html a cada deploy relevante, senão
   este aviso nunca dispara. */
(function(){
  const CURRENT=document.querySelector('meta[name="vx-build"]')?.content||'';
  const POLL_MS=5*60*1000;
  let shown=false;

  function banner(){
    if(shown)return;shown=true;
    const b=document.createElement('div');
    b.id='vxBuildBanner';
    b.innerHTML='<span>Uma nova versão do sistema está disponível -- suas telas abertas ainda estão na versão antiga.</span><button type="button" id="vxBuildReload">ATUALIZAR AGORA</button>';
    document.body.appendChild(b);
    b.querySelector('#vxBuildReload').onclick=()=>location.reload();
  }

  async function check(){
    if(shown||!CURRENT)return;
    try{
      const html=await fetch('/index.html?_='+Date.now(),{cache:'no-store'}).then(r=>r.text());
      const m=html.match(/<meta name="vx-build" content="([^"]*)"/);
      if(m&&m[1]&&m[1]!==CURRENT)banner();
    }catch(_e){/* falha de rede não deve incomodar ninguém -- só tenta de novo no próximo poll */}
  }

  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  setInterval(check,POLL_MS);
  setTimeout(check,15000);

  const style=document.createElement('style');
  style.textContent=`#vxBuildBanner{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#0b2b4a;color:#fff;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px;padding:10px 16px;font-size:12.5px;font-weight:700;box-shadow:0 -4px 16px rgba(0,0,0,.25)}#vxBuildBanner button{height:32px;padding:0 16px;border:0;border-radius:999px;background:#1976d2;color:#fff;font-weight:800;font-size:11.5px;cursor:pointer;white-space:nowrap}#vxBuildBanner button:hover{background:#1467bb}`;
  document.head.appendChild(style);
})();
